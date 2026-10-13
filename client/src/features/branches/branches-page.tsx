import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Pencil, X } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { TimePicker } from "@/components/ui/time-picker";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { extractErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import Pagination from "@/components/ui/pagination";
import { listEmployees } from "@/features/employees/employees.api";
import {
  listBranches,
  createBranch,
  updateBranch,
  type Branch,
  type BranchInput,
} from "./branches.api";

const BRAND = "#8C1515";

/** Parse "H:MM AM" or "H:MM PM" → "HH:mm" 24-hour. Returns "" if unparseable. */
function parseOpHour(token: string): string {
  const m = token.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/** Split stored "H:MM AM – H:MM PM" into [openHHmm, closeHHmm]. */
function parseOperatingHours(value?: string | null): { open: string; close: string } {
  if (!value) return { open: "", close: "" };
  const parts = value.split(/–|-/);
  return { open: parseOpHour(parts[0] ?? ""), close: parseOpHour(parts[1] ?? "") };
}

/** Format two "HH:mm" 24h values back to display string "H:MM AM – H:MM PM". */
function formatOperatingHours(open: string, close: string): string | undefined {
  if (!open && !close) return undefined;
  function fmt(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h < 12 ? "AM" : "PM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }
  return [open && fmt(open), close && fmt(close)].filter(Boolean).join(" – ");
}

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  address: z.string().trim().min(3, "Address is required"),
  city: z.string().trim().min(2, "City is required"),
  branchManager: z.string().trim().optional(),
  operatingHoursOpen: z.string().optional(),
  operatingHoursClose: z.string().optional(),
  phone: z.string().trim().optional(),
  isActive: z.enum(["true", "false"]),
});

type FormValues = z.infer<typeof schema>;

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={
        active
          ? { backgroundColor: "#DCFCE7", color: "#16A34A" }
          : { backgroundColor: "#F3F4F6", color: "#6B7280" }
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}


export default function BranchesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [panelBranch, setPanelBranch] = useState<Branch | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const isEdit = !!panelBranch;
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const query = useQuery({
    queryKey: ["branches", {}],
    queryFn: () => listBranches(),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", {}],
    queryFn: () => listEmployees(),
    enabled: panelOpen,
    select: (data) => data.filter((e) => e.position !== "Administrator"),
  });

  const branches = query.data ?? [];
  const totalBranches = branches.length;
  const activeBranches = branches.filter((b) => b.isActive).length;
  const inactiveBranches = branches.filter((b) => !b.isActive).length;
  const totalPages = Math.max(1, Math.ceil(branches.length / PAGE_SIZE));
  const pageRecords = branches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", address: "", city: "", branchManager: "", operatingHoursOpen: "", operatingHoursClose: "", phone: "", isActive: "true" },
  });

  function openCreate() {
    setPanelBranch(null);
    reset({ name: "", address: "", city: "", branchManager: "", operatingHoursOpen: "", operatingHoursClose: "", phone: "", isActive: "true" });
    setPanelOpen(true);
  }

  function openEdit(branch: Branch) {
    setPanelBranch(branch);
    const { open, close } = parseOperatingHours(branch.operatingHours);
    reset({
      name: branch.name,
      address: branch.address,
      city: branch.city,
      branchManager: branch.branchManager ?? "",
      operatingHoursOpen: open,
      operatingHoursClose: close,
      phone: branch.phone ?? "",
      isActive: branch.isActive ? "true" : "false",
    });
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setPanelBranch(null);
  }

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: BranchInput = {
        name: values.name,
        address: values.address,
        city: values.city,
        branchManager: values.branchManager || undefined,
        operatingHours: formatOperatingHours(values.operatingHoursOpen ?? "", values.operatingHoursClose ?? ""),
        phone: values.phone || undefined,
        isActive: values.isActive === "true",
      };
      return isEdit ? updateBranch(panelBranch!.id, payload) : createBranch(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      toast(isEdit ? "Branch updated" : "Branch created", "success");
      closePanel();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Branches</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
          style={{ backgroundColor: BRAND }}
        >
          + Add Branch
        </button>
      </div>

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="animate-fade-up stagger-1 relative overflow-hidden rounded-xl bg-white p-4 shadow-sm card-hover" style={{ borderLeft: `4px solid ${BRAND}` }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Total</p>
          <p className="font-heading text-4xl leading-none" style={{ color: BRAND }}>{totalBranches}</p>
        </div>
        <div className="animate-fade-up stagger-2 relative overflow-hidden rounded-xl bg-white p-4 shadow-sm card-hover" style={{ borderLeft: "4px solid #16A34A" }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Active</p>
          <p className="font-heading text-4xl leading-none text-green-600">{activeBranches}</p>
        </div>
        <div className="animate-fade-up stagger-3 relative overflow-hidden rounded-xl bg-white p-4 shadow-sm card-hover" style={{ borderLeft: "4px solid #9CA3AF" }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Inactive</p>
          <p className="font-heading text-4xl leading-none text-gray-400">{inactiveBranches}</p>
        </div>
      </div>

      {/* Table */}
      <div className="animate-fade-up stagger-4 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead style={{ background: "#FDFAFA" }}>
            <tr style={{ borderBottom: "1px solid #F5EDED" }}>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Branch Name</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Address</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Branch Manager</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Employees</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Status</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "#F5EDED" }}>
            {query.isLoading && (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" />
                </td>
              </tr>
            )}
            {query.isError && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-red-500 text-sm">
                  {extractErrorMessage(query.error, "Failed to load branches")}
                </td>
              </tr>
            )}
            {query.data && query.data.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                  No branches yet. Click "+ Add Branch" to create one.
                </td>
              </tr>
            )}
            {pageRecords.map((b) => (
              <tr key={b.id} className="transition-colors hover:bg-[#FAF5F5]" style={{ borderBottom: "1px solid #F5EDED" }}>
                <td className="px-5 py-4 font-semibold" style={{ color: BRAND }}>
                  {b.name}
                </td>
                <td className="px-5 py-4 text-gray-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    {[b.address, b.city].filter(Boolean).join(", ")}
                  </span>
                </td>
                <td className="px-5 py-4 text-gray-600">{b.branchManager ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-5 py-4 tabular-nums text-gray-700">
                  {b._count?.employees ?? 0}
                </td>
                <td className="px-5 py-4">
                  <StatusBadge active={b.isActive} />
                </td>
                <td className="px-5 py-4">
                  <button
                    onClick={() => openEdit(b)}
                    className="flex items-center gap-1 text-sm font-medium hover:opacity-80 transition-opacity"
                    style={{ color: BRAND }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} totalRecords={branches.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {/* Slide Panel */}
      {panelOpen && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="flex-1 bg-black/30" onClick={closePanel} />
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {isEdit ? "Edit Branch" : "Add New Branch"}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {isEdit ? "Update branch details." : "Create a new branch location."}
                </p>
              </div>
              <button
                onClick={closePanel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit((v) => mutation.mutate(v))}
              noValidate
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Branch Details section */}
                <div>
                  <h3
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: BRAND }}
                  >
                    Branch Details
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Branch Name *
                      </label>
                      <input
                        {...register("name")}
                        placeholder="e.g. Marfori Branch"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                      />
                      {errors.name && (
                        <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Address *
                      </label>
                      <input
                        {...register("address")}
                        placeholder="e.g. 123 Marfori St., Davao City"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                      />
                      {errors.address && (
                        <p className="text-xs text-red-500 mt-1">{errors.address.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        City *
                      </label>
                      <input
                        {...register("city")}
                        placeholder="e.g. Davao City"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                      />
                      {errors.city && (
                        <p className="text-xs text-red-500 mt-1">{errors.city.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Branch Manager
                      </label>
                      <select
                        {...register("branchManager")}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 bg-white"
                      >
                        <option value="">— Select manager —</option>
                        {(employeesQuery.data ?? []).map((e) => (
                          <option key={e.id} value={`${e.firstName} ${e.lastName}`}>
                            {e.firstName} {e.lastName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Operating Hours
                      </label>
                      <div className="flex items-center gap-2">
                        <Controller
                          name="operatingHoursOpen"
                          control={control}
                          render={({ field }) => (
                            <TimePicker value={field.value} onChange={field.onChange} className="flex-1" />
                          )}
                        />
                        <span className="text-sm text-gray-400 shrink-0">–</span>
                        <Controller
                          name="operatingHoursClose"
                          control={control}
                          render={({ field }) => (
                            <TimePicker value={field.value} onChange={field.onChange} className="flex-1" />
                          )}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        Contact Number
                      </label>
                      <input
                        {...register("phone")}
                        placeholder="+63 82 123 4567"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Branch Status section */}
                <div>
                  <h3
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: BRAND }}
                  >
                    Branch Status
                  </h3>
                  <select
                    {...register("isActive")}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 bg-white"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-6 py-4 flex gap-3">
                <button
                  type="button"
                  onClick={closePanel}
                  className="flex-1 py-2.5 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 py-2.5 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                  style={{ backgroundColor: BRAND }}
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )}
                  {isEdit ? "Save Changes" : "Create Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
