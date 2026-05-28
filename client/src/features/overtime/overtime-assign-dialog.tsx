import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import { listEmployees } from "@/features/employees/employees.api";
import { listBranches } from "@/features/branches/branches.api";
import {
  createOvertimeSchedule,
  updateOvertimeSchedule,
  type OvertimeSchedule,
} from "./overtime.api";

function computeOtHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // overnight
  return Math.round((mins / 60) * 100) / 100;
}

const schema = z.object({
  branchId: z.string().optional(),
  employeeId: z.string().min(1, "Required"),
  date: z.string().min(1, "Required"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM format required"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM format required"),
  otHours: z.number().positive("Must be > 0").max(24, "Max 24h").optional(),
  notes: z.string().trim().max(500).optional(),
});

interface FormValues {
  branchId?: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  otHours?: number;
  notes?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: OvertimeSchedule | null;
}

export default function OvertimeAssignDialog({ open, onOpenChange, editing }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const branchesQuery = useQuery({
    queryKey: ["branches", { isActive: true }],
    queryFn: () => listBranches({ isActive: true }),
    enabled: open,
  });

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployees({}),
    enabled: open,
    select: (data) => data.filter((employee) => employee.employmentStatus !== "TERMINATED" && employee.position !== "Administrator"),
  });

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { branchId: "", employeeId: "", date: "", startTime: "18:00", endTime: "22:00", otHours: undefined, notes: "" },
  });

  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const [userEditedOtHours, setUserEditedOtHours] = useState(false);
  const empDropdownRef = useRef<HTMLDivElement>(null);

  const watchedStart = watch("startTime");
  const watchedEnd = watch("endTime");

  useEffect(() => {
    if (!watchedStart || !watchedEnd) return;
    if (userEditedOtHours) return;
    const hours = computeOtHours(watchedStart, watchedEnd);
    setValue("otHours", hours, { shouldValidate: true });
  }, [watchedStart, watchedEnd, userEditedOtHours, setValue]);

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

  const selectedEmployeeId = watch("employeeId");
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return (employeesQuery.data ?? []).find((e) => e.id === selectedEmployeeId) ?? null;
  }, [employeesQuery.data, selectedEmployeeId]);

  const filteredEmployees = useMemo(() => {
    const all = employeesQuery.data ?? [];
    if (!empSearch.trim()) return all;
    const q = empSearch.trim().toLowerCase();
    return all.filter((e) => `${e.firstName} ${e.lastName} ${e.employeeId}`.toLowerCase().includes(q));
  }, [employeesQuery.data, empSearch]);

  useEffect(() => {
    if (open) {
      setEmpSearch("");
      setEmpDropdownOpen(false);
      setUserEditedOtHours(false);
      if (editing) {
        reset({
          branchId: editing.employee.branch?.id ?? "",
          employeeId: editing.employeeId,
          date: editing.date.slice(0, 10),
          startTime: editing.startTime,
          endTime: editing.endTime,
          otHours: editing.otHours ? Number(editing.otHours) : undefined,
          notes: editing.notes ?? "",
        });
      } else {
        reset({ branchId: "", employeeId: "", date: "", startTime: "18:00", endTime: "22:00", otHours: undefined, notes: "" });
      }
    }
  }, [open, editing, reset]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      editing
        ? updateOvertimeSchedule(editing.id, {
            date: v.date,
            startTime: v.startTime,
            endTime: v.endTime,
            otHours: v.otHours,
            notes: v.notes?.trim() || undefined,
          })
        : createOvertimeSchedule({
            employeeId: v.employeeId,
            date: v.date,
            startTime: v.startTime,
            endTime: v.endTime,
            otHours: v.otHours,
            notes: v.notes?.trim() || undefined,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-schedules"] });
      toast(editing ? "Schedule updated" : "Overtime scheduled", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Overtime Schedule" : "Assign Overtime"}</DialogTitle>
        <DialogDescription>
          Pre-assign an overtime shift for an employee.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-4 pt-4"
        noValidate
      >
        {!editing && (
          <>
            <div className="space-y-2">
              <Label htmlFor="ot-branch">Branch</Label>
              <Select id="ot-branch" {...register("branchId")}>
                <option value="">All branches</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Employee</Label>
              <div className="relative" ref={empDropdownRef}>
                <button
                  type="button"
                  onClick={() => { setEmpDropdownOpen((o) => !o); setEmpSearch(""); }}
                  className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className={selectedEmployee ? "text-gray-900" : "text-gray-400"}>
                    {selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName} (${selectedEmployee.employeeId})` : "Select employee…"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>
                {errors.employeeId && <p className="text-xs text-destructive">{errors.employeeId.message}</p>}
                {empDropdownOpen && (
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
                      {filteredEmployees.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">
                          {empSearch.trim() ? "No employees match your search." : "No active employees found."}
                        </p>
                      ) : (
                        filteredEmployees.slice(0, 100).map((emp) => (
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
                            {emp.firstName} {emp.lastName} <span className="text-xs text-gray-400">({emp.employeeId})</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="ot-date">Date</Label>
          <Input id="ot-date" type="date" {...register("date")} />
          {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ot-start">Start Time</Label>
            <Controller
              name="startTime"
              control={control}
              render={({ field }) => (
                <TimePicker id="ot-start" value={field.value} onChange={field.onChange} />
              )}
            />
            {errors.startTime && <p className="text-xs text-destructive">{errors.startTime.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ot-end">End Time</Label>
            <Controller
              name="endTime"
              control={control}
              render={({ field }) => (
                <TimePicker id="ot-end" value={field.value} onChange={field.onChange} />
              )}
            />
            {errors.endTime && <p className="text-xs text-destructive">{errors.endTime.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ot-hours">OT Hours (auto-computed)</Label>
          <Input
            id="ot-hours"
            type="number"
            step="0.5"
            min="0.5"
            max="24"
            placeholder="e.g. 2"
            {...register("otHours", {
              setValueAs: (v) => v === "" || v === undefined ? undefined : Number(v),
              onChange: () => setUserEditedOtHours(true),
            })}
          />
          {errors.otHours && <p className="text-xs text-destructive">{errors.otHours.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ot-notes">Notes (optional)</Label>
          <Textarea id="ot-notes" rows={2} placeholder="Reason or additional instructions…" {...register("notes")} />
          {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save Changes" : "Assign Overtime"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
