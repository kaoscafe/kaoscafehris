import { useRef, useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Pencil, Search } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/components/ui/toast";
import Pagination from "@/components/ui/pagination";
import { extractErrorMessage } from "@/lib/api";
import { listBranches } from "@/features/branches/branches.api";
import {
  getImportTemplateUrl,
  importEmployeesCsv,
  previewImportCsv,
  listEmployees,
  createEmployee,
  updateEmployee,
  type Employee,
  type EmploymentStatus,
  type ImportPreview,
  type EmployeeCreateInput,
  type EmployeeUpdateInput,
} from "./employees.api";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ImportPreviewDialog from "./import-preview-dialog";
import EmployeeDeductionsTable, { type PendingDeduction } from "./employee-deductions-table";
import { addEmployeeDeduction } from "./employee-deductions.api";
import EmployeeEarningsTable, { type PendingEarning } from "./employee-earnings-table";
import EmployeeOneTimeEarningsTable, { type PendingOneTimeEarning } from "./employee-one-time-earnings-table";
import EmployeeDocumentsTable from "./employee-documents-table";
import { addEmployeeEarning } from "./employee-earnings.api";
import { addEmployeeOneTimeEarning } from "./employee-one-time-earnings.api";

const BRAND = "#8C1515";

const toFloat = (v: string | number) => (typeof v === "string" ? parseFloat(v) : v);

const baseSchema = {
  email: z.string().trim().email("Valid email required"),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  employeeId: z
    .string()
    .trim()
    .min(2, "Employee ID is required")
    .regex(/^[A-Za-z0-9-_]+$/, "Letters, numbers, dash, underscore only"),
  branchId: z.string().uuid("Select a branch"),
  firstName: z.string().trim().min(1, "Required"),
  middleName: z.string().trim().optional(),
  lastName: z.string().trim().min(1, "Required"),
  dateOfBirth: z.string().optional(),
  position: z.string().trim().min(1, "Required"),
  employmentStatus: z.enum(["TRAINEE", "FULL_TIME", "PART_TIME", "RESERVED", "TERMINATED"]),
  dateHired: z.string().min(1, "Required"),
  payType: z.enum(["MONTHLY_FIXED", "HOURLY"]),
  basicSalary: z.union([z.string(), z.number()]).transform(toFloat).pipe(z.number().min(0)),
  hourlyRate: z.union([z.string(), z.number()]).transform(toFloat).pipe(z.number().min(0)).optional(),
  phone: z.string().trim().optional(),
  sssNumber: z.string().trim().optional(),
  philhealthNumber: z.string().trim().optional(),
  pagibigNumber: z.string().trim().optional(),
  tinNumber: z.string().trim().optional(),
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const payRateRefine = (d: any) =>
  d.payType === "HOURLY" ? (d.hourlyRate ?? 0) > 0 : (d.basicSalary ?? 0) > 0;
const payRateIssue = { message: "Rate must be greater than zero", path: ["hourlyRate"] };

const createSchema = z
  .object({ ...baseSchema, password: z.string().min(8, "At least 8 characters") })
  .refine(payRateRefine, payRateIssue);

const editSchema = z
  .object({
    ...baseSchema,
    password: z.string().optional().refine((v) => !v || v.length >= 8, "At least 8 characters"),
  })
  .refine(payRateRefine, payRateIssue);

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;
type FormValues = CreateValues & EditValues;

function StatusBadge({ status }: { status: EmploymentStatus }) {
  const map: Record<EmploymentStatus, { bg: string; color: string; label: string }> = {
    FULL_TIME: { bg: "#DCFCE7", color: "#16A34A", label: "Full Time" },
    PART_TIME: { bg: "#DBEAFE", color: "#2563EB", label: "Part Time" },
    TRAINEE: { bg: "#FEF3C7", color: "#D97706", label: "Trainee" },
    RESERVED: { bg: "#F3F4F6", color: "#6B7280", label: "Reserved" },
    TERMINATED: { bg: "#FEE2E2", color: "#DC2626", label: "Terminated" },
  };
  const s = map[status] ?? map.RESERVED;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getInitialsBgColor(firstName: string, lastName: string) {
  const colors = [
    "#FED7AA",
    "#C7D2FE",
    "#FBCFE8",
    "#A7F3D0",
    "#FCA5A5",
  ];
  const initials = getInitials(firstName, lastName);
  const charCode = initials.charCodeAt(0) + initials.charCodeAt(1);
  return colors[charCode % colors.length];
}

function hasEmployeeDocument(employee: Employee, needle: string) {
  const docs = employee.documents ?? [];
  const lowercaseNeedle = needle.toLowerCase();
  return docs.some((doc) =>
    [doc.name, doc.originalName, doc.filename]
      .map((value) => value.toLowerCase())
      .some((value) => value.includes(lowercaseNeedle))
  );
}

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [role, setRole] = useState("");
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingDeductions, setPendingDeductions] = useState<PendingDeduction[]>([]);
  const [pendingEarnings, setPendingEarnings] = useState<PendingEarning[]>([]);
  const [pendingOneTimeEarnings, setPendingOneTimeEarnings] = useState<PendingOneTimeEarning[]>([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const isEdit = !!detailEmployee;

  const resolver = useMemo(
    () => zodResolver(isEdit ? editSchema : createSchema),
    [isEdit]
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: resolver as never,
    defaultValues: {
      email: "", password: "", role: "EMPLOYEE", employeeId: "",
      branchId: "", firstName: "", middleName: "", lastName: "", position: "",
      employmentStatus: "FULL_TIME", dateHired: "",
      payType: "MONTHLY_FIXED",
      basicSalary: 0 as unknown as number,
      hourlyRate: undefined,
      phone: "",
      sssNumber: "", philhealthNumber: "", pagibigNumber: "", tinNumber: "",
    },
  });

  const payType = useWatch({ control, name: "payType" });

  useEffect(() => {
    if (!isEditMode) return;
    if (detailEmployee) {
      reset({
        email: detailEmployee.user.email,
        password: "",
        role: detailEmployee.user.role,
        employeeId: detailEmployee.employeeId,
        branchId: detailEmployee.branchId,
        firstName: detailEmployee.firstName,
        middleName: detailEmployee.middleName ?? "",
        lastName: detailEmployee.lastName,
        dateOfBirth: detailEmployee.dateOfBirth ? detailEmployee.dateOfBirth.slice(0, 10) : "",
        position: detailEmployee.position,
        employmentStatus: detailEmployee.employmentStatus,
        dateHired: detailEmployee.dateHired.slice(0, 10),
        payType: detailEmployee.payType,
        basicSalary: parseFloat(detailEmployee.basicSalary),
        hourlyRate: detailEmployee.hourlyRate ? parseFloat(detailEmployee.hourlyRate) : undefined,
        phone: detailEmployee.phone ?? "",
        sssNumber: detailEmployee.sssNumber ?? "",
        philhealthNumber: detailEmployee.philhealthNumber ?? "",
        pagibigNumber: detailEmployee.pagibigNumber ?? "",
        tinNumber: detailEmployee.tinNumber ?? "",
      });
    } else {
      reset({
        email: "", password: "", role: "EMPLOYEE", employeeId: "",
        branchId: "", firstName: "", middleName: "", lastName: "", dateOfBirth: "", position: "",
        employmentStatus: "FULL_TIME", dateHired: "",
        payType: "MONTHLY_FIXED",
        basicSalary: 0 as unknown as number,
        hourlyRate: undefined,
        phone: "",
        sssNumber: "", philhealthNumber: "", pagibigNumber: "", tinNumber: "",
      });
    }
  }, [isEditMode, detailEmployee, reset]);

  const formMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) {
        const payload: EmployeeUpdateInput = {
          email: values.email, role: values.role, employeeId: values.employeeId,
          branchId: values.branchId, firstName: values.firstName,
          lastName: values.lastName, middleName: values.middleName || undefined,
          dateOfBirth: values.dateOfBirth || undefined,
          position: values.position,
          employmentStatus: values.employmentStatus, dateHired: values.dateHired,
          payType: values.payType,
          basicSalary: values.payType === "MONTHLY_FIXED" ? values.basicSalary : 0,
          hourlyRate: values.payType === "HOURLY" ? values.hourlyRate : undefined,
          phone: values.phone || undefined,
          sssNumber: values.sssNumber || undefined,
          philhealthNumber: values.philhealthNumber || undefined,
          pagibigNumber: values.pagibigNumber || undefined,
          tinNumber: values.tinNumber || undefined,
        };
        if (values.password) payload.password = values.password;
        return updateEmployee(detailEmployee!.id, payload);
      }
      const payload: EmployeeCreateInput = {
        email: values.email, password: values.password!,
        role: values.role, employeeId: values.employeeId,
        branchId: values.branchId, firstName: values.firstName,
        lastName: values.lastName, middleName: values.middleName || undefined,
        dateOfBirth: values.dateOfBirth || undefined,
        position: values.position,
        employmentStatus: values.employmentStatus, dateHired: values.dateHired,
        payType: values.payType,
        basicSalary: values.payType === "MONTHLY_FIXED" ? values.basicSalary : 0,
        hourlyRate: values.payType === "HOURLY" ? values.hourlyRate : undefined,
        phone: values.phone || undefined,
        sssNumber: values.sssNumber || undefined,
        philhealthNumber: values.philhealthNumber || undefined,
        pagibigNumber: values.pagibigNumber || undefined,
        tinNumber: values.tinNumber || undefined,
      };
      return createEmployee(payload);
    },
    onSuccess: async (created) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["branches"] });
      if (isEdit) {
        toast("Employee updated", "success");
        setIsEditMode(false);
        setDetailEmployee(null);
      } else {
        if (pendingDeductions.length > 0) {
          for (const d of pendingDeductions) {
            await addEmployeeDeduction(created.id, {
              deductionId: d.deductionId,
              amount: d.amount,
              totalBalance: d.totalBalance,
            });
          }
          setPendingDeductions([]);
        }
        if (pendingEarnings.length > 0) {
          for (const e of pendingEarnings) {
            await addEmployeeEarning(created.id, {
              type: e.type,
              label: e.label,
              amount: e.amount,
            });
          }
          setPendingEarnings([]);
        }
        if (pendingOneTimeEarnings.length > 0) {
          for (const e of pendingOneTimeEarnings) {
            await addEmployeeOneTimeEarning(created.id, {
              type: e.type,
              label: e.label,
              amount: e.amount,
              effectiveDate: e.effectiveDate,
            });
          }
          setPendingOneTimeEarnings([]);
        }
        toast("Employee created", "success");
        setIsEditMode(false);
        setDetailEmployee(null);
      }
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const branchesQuery = useQuery({
    queryKey: ["branches", { active: true }],
    queryFn: () => listBranches({ isActive: true }),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", search, branchId, role],
    queryFn: () => listEmployees({
      search: search || undefined,
      branchId: branchId || undefined,
      role: (role as "ADMIN" | "MANAGER" | "EMPLOYEE") || undefined,
    }),
  });


  const previewMutation = useMutation({
    mutationFn: (file: File) => previewImportCsv(file),
    onSuccess: (preview) => {
      setImportPreview(preview);
    },
    onError: (err) => {
      toast(extractErrorMessage(err), "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => importEmployeesCsv(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast("Employees imported successfully", "success");
      setImportPreview(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => {
      toast(extractErrorMessage(err), "error");
      setImportPreview(null);
      setPendingFile(null);
    },
  });

  // Exclude the system administrator account from the employee list
  const filtered = (employeesQuery.data ?? []).filter(
    (e) => e.position !== "Administrator"
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRecords = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasBranches = (branchesQuery.data?.length ?? 0) > 0;

  const stats = {
    total: filtered.length,
    fullTime: filtered.filter(e => e.employmentStatus === "FULL_TIME").length,
    partTime: filtered.filter(e => e.employmentStatus === "PART_TIME").length,
    trainee: filtered.filter(e => e.employmentStatus === "TRAINEE").length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Employees</h1>
        </div>
        <div className="flex items-center gap-2">
          <a href={getImportTemplateUrl()} download>
            <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Template
            </button>
          </a>
          <button
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => fileInputRef.current?.click()}
            disabled={previewMutation.isPending || importMutation.isPending || !hasBranches}
            title={!hasBranches ? "Add at least one branch before importing employees" : ""}
          >
            {previewMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            + Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setPendingFile(file);
                previewMutation.mutate(file);
              }
            }}
          />
          <button
            onClick={() => { setDetailEmployee(null); setPendingDeductions([]); setPendingEarnings([]); setIsEditMode(true); }}
            className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: BRAND }}
            disabled={!hasBranches}
            title={!hasBranches ? "Add at least one branch before creating employees" : ""}
          >
            + Add Employee
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="animate-fade-up stagger-1 relative overflow-hidden rounded-xl bg-white p-4 shadow-sm card-hover" style={{ borderLeft: `4px solid ${BRAND}` }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Total</p>
          <p className="font-heading text-4xl leading-none" style={{ color: BRAND }}>{stats.total}</p>
        </div>
        <div className="animate-fade-up stagger-2 relative overflow-hidden rounded-xl bg-white p-4 shadow-sm card-hover" style={{ borderLeft: "4px solid #16A34A" }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Full Time</p>
          <p className="font-heading text-4xl leading-none text-green-600">{stats.fullTime}</p>
        </div>
        <div className="animate-fade-up stagger-3 relative overflow-hidden rounded-xl bg-white p-4 shadow-sm card-hover" style={{ borderLeft: "4px solid #2563EB" }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Part Time</p>
          <p className="font-heading text-4xl leading-none text-blue-600">{stats.partTime}</p>
        </div>
        <div className="animate-fade-up stagger-4 relative overflow-hidden rounded-xl bg-white p-4 shadow-sm card-hover" style={{ borderLeft: "4px solid #D97706" }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Trainee</p>
          <p className="font-heading text-4xl leading-none text-amber-600">{stats.trainee}</p>
        </div>
      </div>

      {!hasBranches && (
        <div className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="font-medium">⚠ No branches available</p>
          <p className="text-xs mt-1">Please create at least one branch before adding or importing employees.</p>
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm animate-fade-up stagger-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            className="w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:outline-none"
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700"
          value={branchId}
          onChange={(e) => { setBranchId(e.target.value); setPage(1); }}
        >
          <option value="">All Branches</option>
          {branchesQuery.data?.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700"
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
        >
          <option value="">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="EMPLOYEE">Employee</option>
        </select>
      </div>

      {/* Table */}
      <div className="animate-fade-up stagger-5 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #F5EDED", backgroundColor: "#FDFAFA" }}>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Employee ID</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Name</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Position</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Branch</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Role</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Documents</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Status</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ "--tw-divide-opacity": 1 } as React.CSSProperties}>
            {employeesQuery.isLoading && (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" />
                </td>
              </tr>
            )}
            {employeesQuery.isError && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-red-500">
                  {extractErrorMessage(employeesQuery.error, "Failed to load employees")}
                </td>
              </tr>
            )}
            {!employeesQuery.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                  No employees match the current filters.
                </td>
              </tr>
            )}
            {pageRecords.map((e) => (
              <tr
                key={e.id}
                className="transition-colors hover:bg-[#FAF5F5]"
                style={{ borderBottom: "1px solid #F5EDED" }}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-gray-700"
                      style={{ backgroundColor: getInitialsBgColor(e.firstName, e.lastName) }}
                    >
                      {getInitials(e.firstName, e.lastName)}
                    </div>
                    <span className="font-mono text-xs font-semibold" style={{ color: BRAND }}>{e.employeeId}</span>
                  </div>
                </td>
                <td className="px-5 py-4 font-semibold text-gray-800">
                  {e.firstName} {e.lastName}
                </td>
                <td className="px-5 py-4 text-gray-600">{e.position}</td>
                <td className="px-5 py-4 font-medium" style={{ color: BRAND }}>{e.branch?.name ?? "—"}</td>
                <td className="px-5 py-4 text-gray-600 capitalize">{e.user.role.toLowerCase()}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {hasEmployeeDocument(e, "nbi") ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">NBI</span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Missing NBI</span>
                    )}
                    {hasEmployeeDocument(e, "nda") ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">NDA</span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Missing NDA</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={e.employmentStatus} />
                </td>
                <td className="px-5 py-4">
                  <button
                    className="flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors"
                    style={{ color: BRAND }}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      setDetailEmployee(e);
                      setIsEditMode(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} totalRecords={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>


      {/* Import Preview Dialog */}
      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          isPending={importMutation.isPending}
          onConfirm={() => pendingFile && importMutation.mutate(pendingFile)}
          onCancel={() => {
            setImportPreview(null);
            setPendingFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      )}

      {/* Add / Edit Employee Dialog */}
      <Dialog
        open={isEditMode}
        onOpenChange={(open) => { if (!open) { setDetailEmployee(null); setIsEditMode(false); } }}
        className="max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "Add New Employee"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update profile and account details." : "Create the user login and employee profile."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => formMutation.mutate(v))} noValidate>
          <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-6 mt-4">

                {/* ACCOUNT */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND }}>Account</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Employee ID *</label>
                      <input {...register("employeeId")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      {errors.employeeId && <p className="text-xs text-red-500 mt-1">{errors.employeeId.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">System Role *</label>
                      <select {...register("role")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 bg-white">
                        <option value="EMPLOYEE">Employee</option>
                        <option value="MANAGER">Branch Manager</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      {errors.role && <p className="text-xs text-red-500 mt-1">{errors.role.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{isEdit ? "New Password (Optional)" : "Password *"}</label>
                      <input {...register("password")} type="password" placeholder={isEdit ? "Leave blank to keep" : "Min. 8 characters"} autoComplete="new-password" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Employment Status *</label>
                      <select {...register("employmentStatus")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 bg-white">
                        <option value="FULL_TIME">Full Time</option>
                        <option value="PART_TIME">Part Time</option>
                        <option value="TRAINEE">Trainee</option>
                        <option value="RESERVED">Reserved</option>
                        <option value="TERMINATED">Terminated</option>
                      </select>
                      {errors.employmentStatus && <p className="text-xs text-red-500 mt-1">{errors.employmentStatus.message}</p>}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email Address</label>
                      <input {...register("email")} type="email" placeholder="employee@kaoscafe.com" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
                    </div>
                  </div>
                </div>

                {/* IDENTITY */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND }}>Identity</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">First Name *</label>
                      <input {...register("firstName")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Middle Name</label>
                      <input {...register("middleName")} placeholder="Optional" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Last Name *</label>
                      <input {...register("lastName")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Birthdate</label>
                      <input type="date" {...register("dateOfBirth")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone Number</label>
                      <input {...register("phone")} placeholder="+63 9xx xxx xxxx" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                </div>

                {/* EMPLOYMENT */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND }}>Employment</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Branch *</label>
                      <select {...register("branchId")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 bg-white">
                        <option value="">Select branch...</option>
                        {branchesQuery.data?.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                      {errors.branchId && <p className="text-xs text-red-500 mt-1">{errors.branchId.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Position / Job Title *</label>
                      <input {...register("position")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      {errors.position && <p className="text-xs text-red-500 mt-1">{errors.position.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date Hired *</label>
                      <input {...register("dateHired")} type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      {errors.dateHired && <p className="text-xs text-red-500 mt-1">{errors.dateHired.message}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pay Type *</label>
                      <select {...register("payType")} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 bg-white">
                        <option value="MONTHLY_FIXED">Monthly Fixed</option>
                        <option value="HOURLY">Hourly</option>
                      </select>
                    </div>
                    {payType === "HOURLY" ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Hourly Rate (PHP/hr) *</label>
                        <input {...register("hourlyRate")} type="number" step="any" min="0" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                        {errors.hourlyRate && <p className="text-xs text-red-500 mt-1">{errors.hourlyRate.message}</p>}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Basic Salary (PHP/mo) *</label>
                        <input {...register("basicSalary")} type="number" step="0.01" min="0" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                        {errors.basicSalary && <p className="text-xs text-red-500 mt-1">{errors.basicSalary.message}</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* GOVERNMENT IDs */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND }}>Government IDs</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">SSS Number</label>
                      <input {...register("sssNumber")} placeholder="XX-XXXXXXX-X" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">PhilHealth Number</label>
                      <input {...register("philhealthNumber")} placeholder="XXXX-XXXXXXXX-X" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pag-IBIG Number</label>
                      <input {...register("pagibigNumber")} placeholder="XXXX-XXXX-XXXX" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">TIN Number</label>
                      <input {...register("tinNumber")} placeholder="XXX-XXX-XXX" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                </div>

                {/* DEDUCTIONS */}
                {detailEmployee ? (
                  <EmployeeDeductionsTable employeeId={detailEmployee.id} />
                ) : (
                  <EmployeeDeductionsTable
                    pendingDeductions={pendingDeductions}
                    onPendingChange={setPendingDeductions}
                  />
                )}

                {/* RECURRING EARNINGS */}
                {detailEmployee ? (
                  <EmployeeEarningsTable employeeId={detailEmployee.id} />
                ) : (
                  <EmployeeEarningsTable
                    pendingEarnings={pendingEarnings}
                    onPendingChange={setPendingEarnings}
                  />
                )}

                {/* ONE-TIME EARNINGS */}
                {detailEmployee ? (
                  <EmployeeOneTimeEarningsTable employeeId={detailEmployee.id} />
                ) : (
                  <EmployeeOneTimeEarningsTable
                    pendingOneTimeEarnings={pendingOneTimeEarnings}
                    onPendingChange={setPendingOneTimeEarnings}
                  />
                )}

                {/* DOCUMENTS (edit mode only) */}
                {detailEmployee && (
                  <EmployeeDocumentsTable employeeId={detailEmployee.id} />
                )}

          </div>

          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={() => { setIsEditMode(false); setDetailEmployee(null); }}
              className="px-4 py-2 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formMutation.isPending}
              className="px-5 py-2 rounded-lg font-medium text-white flex items-center gap-2 transition-colors disabled:opacity-60"
              style={{ backgroundColor: BRAND }}
            >
              {formMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              {isEdit ? "Save Changes" : "Create Employee"}
            </button>
          </DialogFooter>
        </form>
      </Dialog>

    </div>
  );
}
