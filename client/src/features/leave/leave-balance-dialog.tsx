import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import { listEmployees } from "@/features/employees/employees.api";
import {
  listBalances,
  upsertBalance,
  upsertBalanceForAllEmployees,
  type LeaveBalance,
  type LeaveType,
} from "./leave.api";

const schema = z.object({
  employeeId: z.string().optional(),
  applyToAll: z.boolean().default(false),
  leaveType: z.enum([
    "VACATION",
    "SICK",
    "EMERGENCY",
    "MATERNITY",
    "PATERNITY",
    "UNPAID",
  ]),
  year: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? parseInt(v, 10) : v))
    .pipe(z.number().int().min(2020).max(2100)),
  totalDays: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? parseFloat(v) : v))
    .pipe(z.number().min(0).max(365)),
}).refine(
  (data) => data.applyToAll || data.employeeId,
  { message: "Select an employee or apply to all", path: ["employeeId"] }
);

type Values = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPES: LeaveType[] = [
  "VACATION",
  "SICK",
  "EMERGENCY",
  "MATERNITY",
  "PATERNITY",
];

export default function LeaveBalanceDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const currentYear = new Date().getUTCFullYear();
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterEmployee, setFilterEmployee] = useState<string>("");

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployees({}),
    enabled: open,
    select: (data) =>
      data.filter(
        (e) => e.employmentStatus !== "TERMINATED" && e.position !== "Administrator"
      ),
  });

  const balancesQuery = useQuery({
    queryKey: ["leave-balances", { year: filterYear, employeeId: filterEmployee }],
    queryFn: () =>
      listBalances({
        year: filterYear,
        employeeId: filterEmployee || undefined,
      }),
    enabled: open,
  });

  const defaults = useMemo<Values>(
    () => ({
      employeeId: "",
      applyToAll: false,
      leaveType: "VACATION",
      year: currentYear,
      totalDays: 0,
    }),
    [currentYear]
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: defaults,
  });

  const watchApplyToAll = watch("applyToAll");

  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const empDropdownRef = useRef<HTMLDivElement>(null);

  const selectedEmployeeId = watch("employeeId");
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return (employeesQuery.data ?? []).find((e) => e.id === selectedEmployeeId) ?? null;
  }, [employeesQuery.data, selectedEmployeeId]);

  const filteredEmployees = useMemo(() => {
    const all = employeesQuery.data ?? [];
    if (!empSearch.trim()) return all;
    const q = empSearch.trim().toLowerCase();
    return all.filter((e) =>
      `${e.firstName} ${e.lastName} ${e.employeeId}`.toLowerCase().includes(q)
    );
  }, [employeesQuery.data, empSearch]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (empDropdownRef.current && !empDropdownRef.current.contains(e.target as Node)) {
        setEmpDropdownOpen(false);
      }
    }
    if (empDropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [empDropdownOpen]);

  useEffect(() => {
    if (open) {
      reset(defaults);
      setEmpSearch("");
      setEmpDropdownOpen(false);
    }
  }, [open, reset, defaults]);

  const mutation = useMutation({
    mutationFn: (values: Values): Promise<LeaveBalance | { message: string; count: number }> => {
      if (values.applyToAll) {
        return upsertBalanceForAllEmployees({
          leaveType: values.leaveType,
          year: values.year,
          totalDays: values.totalDays,
        });
      }
      return upsertBalance({
        employeeId: values.employeeId!,
        leaveType: values.leaveType,
        year: values.year,
        totalDays: values.totalDays,
      });
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["portal-leave-balances"] });
      if (typeof result === "object" && "message" in result) {
        toast(`${result.message}`, "success");
      } else {
        toast("Balance saved", "success");
      }
      reset(defaults);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Leave balances</DialogTitle>
        <DialogDescription>
          Set each employee's yearly leave entitlement. When updating an existing balance, previously-used days are preserved.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[70vh] space-y-5 overflow-y-auto pt-4 pr-1">
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4 rounded-md border bg-muted/30 p-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="bal-employee">Employee</Label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("applyToAll")}
                    className="rounded border-gray-300"
                  />
                  <span>Apply to all employees</span>
                </label>
              </div>
              <input type="hidden" {...register("employeeId")} />
              <div className="relative" ref={empDropdownRef}>
                <button
                  type="button"
                  disabled={watchApplyToAll}
                  onClick={() => {
                    setEmpDropdownOpen((o) => !o);
                    setEmpSearch("");
                  }}
                  className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className={selectedEmployee ? "text-gray-900" : "text-gray-400"}>
                    {selectedEmployee
                      ? `${selectedEmployee.firstName} ${selectedEmployee.lastName} · ${selectedEmployee.employeeId}`
                      : "Select employee…"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>
                {empDropdownOpen && !watchApplyToAll && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
                    <div className="p-1 bg-white rounded-lg">
                      <div className="px-2 py-2">
                        <input
                          type="text"
                          placeholder="Search employees..."
                          value={empSearch}
                          onChange={(e) => setEmpSearch(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {filteredEmployees.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-gray-400">
                            {empSearch.trim()
                              ? "No employees match your search."
                              : "No employees found."}
                          </p>
                        ) : (
                          filteredEmployees.map((emp) => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                setValue("employeeId", emp.id, { shouldValidate: true });
                                setEmpDropdownOpen(false);
                                setEmpSearch("");
                              }}
                              className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-gray-50 text-left"
                            >
                              {emp.firstName} {emp.lastName}{" "}
                              <span className="text-xs text-gray-400">({emp.employeeId})</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {errors.employeeId && (
                <p className="text-xs text-destructive">{errors.employeeId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bal-type">Leave type</Label>
              <Select id="bal-type" {...register("leaveType")}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bal-year">Year</Label>
              <Input id="bal-year" type="number" {...register("year")} />
              {errors.year && (
                <p className="text-xs text-destructive">{errors.year.message}</p>
              )}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bal-total">Total days</Label>
              <Input
                id="bal-total"
                type="number"
                step="0.5"
                min="0"
                {...register("totalDays")}
              />
              {errors.totalDays && (
                <p className="text-xs text-destructive">{errors.totalDays.message}</p>
              )}
            </div>
          </div>
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save balance
          </Button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="filter-year">Filter year</Label>
            <Input
              id="filter-year"
              type="number"
              value={filterYear}
              onChange={(e) => setFilterYear(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-emp">Filter employee</Label>
            <Select
              id="filter-emp"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
            >
              <option value="">All</option>
              {employeesQuery.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balancesQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {balancesQuery.data && balancesQuery.data.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No balances for this view.
                  </TableCell>
                </TableRow>
              )}
              {balancesQuery.data?.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-nowrap">
                    {b.employee.firstName} {b.employee.lastName}
                  </TableCell>
                  <TableCell>{b.leaveType}</TableCell>
                  <TableCell className="tabular-nums">{b.year}</TableCell>
                  <TableCell className="tabular-nums">{b.totalDays}</TableCell>
                  <TableCell className="tabular-nums">{b.usedDays}</TableCell>
                  <TableCell className="tabular-nums">{b.remainingDays}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
