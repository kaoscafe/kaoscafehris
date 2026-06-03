import { useEffect, useMemo, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, RotateCcw, X, XCircle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import {
  adjustAttendance,
  getAssignedShift,
  type AdjustAttendanceInput,
  type AttendanceRecord,
} from "./attendance.api";
import { setShiftOvertimeApproval } from "@/features/overtime/overtime.api";
import { listSettings } from "@/features/settings/settings.api";
import { COMPANY_TZ, isoToDateStr, isoToTimeStr, toIso, nextDayLocalIso } from "@/lib/timezone";

const schema = z.object({
  date: z.string().min(1, "Required"),
  clockInTime: z.string().min(1, "Required"),
  clockOutTime: z.string().optional(),
  status: z.enum(["AUTO", "ABSENT", "HALF_DAY", "ON_LEAVE"]),
  remarks: z.string().max(500).optional(),
});

type Values = z.infer<typeof schema>;

function fmtShiftTime(iso: string): string {
  // Shift times come as UTC Date objects serialized to ISO — only the time portion matters.
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
  });
}

function parseHHMM(s: string): number {
  if (!s) return -1;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AttendanceRecord | null;
}

export default function AttendanceAdjustDialog({ open, onOpenChange, record }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [otDecision, setOtDecision] = useState<"approved" | "rejected" | null>(null);
  const [overrideOtHours, setOverrideOtHours] = useState<string>("");

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: "",
      clockInTime: "",
      clockOutTime: "",
      status: "AUTO",
      remarks: "",
    },
  });

  const tz = COMPANY_TZ;

 useEffect(() => {
  if (!open) {
    setLightbox(null);
    setOtDecision(null);
    setOverrideOtHours("");
    return;
  }
  if (!record) return;

  setOtDecision(null);
  setOverrideOtHours(
    record.overtimeHours != null ? String(Number(record.overtimeHours)) : ""
  );

  reset({
    date: isoToDateStr(record.clockIn, tz),
    clockInTime: isoToTimeStr(record.clockIn, tz),
    clockOutTime: isoToTimeStr(record.clockOut, tz),
    status:
      record.status === "ABSENT" ||
      record.status === "HALF_DAY" ||
      record.status === "ON_LEAVE"
        ? record.status
        : "AUTO",
    remarks: record.remarks ?? "",
  });
}, [open, record, reset, tz]);

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      if (!record) throw new Error("Missing record");
      const clockOutDate =
        values.clockOutTime && values.clockOutTime < values.clockInTime
          ? nextDayLocalIso(values.date, tz)
          : values.date;
      const payload: AdjustAttendanceInput = {
        clockIn: toIso(values.date, values.clockInTime, tz),
        clockOut: values.clockOutTime ? toIso(clockOutDate, values.clockOutTime, tz) : null,
        status: values.status === "AUTO" ? undefined : values.status,
        remarks: values.remarks?.trim() ? values.remarks : null,
        overtimeHours: overrideOtHours !== "" ? Number(overrideOtHours) : undefined,
      };
      return adjustAttendance(record.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      toast("Attendance updated", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const shiftQuery = useQuery({
    queryKey: ["assigned-shift", record?.employeeId, record?.date.slice(0, 10)],
    queryFn: () => getAssignedShift(record!.employeeId, record!.date.slice(0, 10)),
    enabled: open && !!record,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings", "attendance"],
    queryFn: () => listSettings("attendance"),
    staleTime: 5 * 60 * 1000,
  });

  const lateThresholdMinutes = Number(
    settingsQuery.data?.find((s) => s.key === "attendance.late_threshold")?.value ?? 0
  );

  const clockInTime = useWatch({ control, name: "clockInTime" });
  const clockOutTime = useWatch({ control, name: "clockOutTime" });

  const attendanceSummary = useMemo(() => {
  const shift = shiftQuery.data;
  if (!shift || !clockInTime || !clockOutTime) return null;

  const startMins = new Date(shift.startTime).getUTCHours() * 60 + new Date(shift.startTime).getUTCMinutes();
  const endMins = new Date(shift.endTime).getUTCHours() * 60 + new Date(shift.endTime).getUTCMinutes();
  const ciMins = parseHHMM(clockInTime);
  const coMins = parseHHMM(clockOutTime);

  if (ciMins < 0 || coMins < 0) return null;

  const rawLateMins = Math.max(0, ciMins - startMins);
  const lateMins = rawLateMins > lateThresholdMinutes ? rawLateMins : 0;

  let effectiveCo = coMins;
  let effectiveEnd = endMins;

  // If the entered clock-out is earlier than clock-in, treat it as next day.
  if (coMins < ciMins) {
    effectiveCo += 24 * 60;
  }

  // Overnight shifts also end on the next day.
  if (endMins < startMins) {
    effectiveEnd += 24 * 60;
  }

  const otMins = Math.max(0, effectiveCo - effectiveEnd);
  return { lateMins, otMins };
}, [shiftQuery.data, clockInTime, clockOutTime, lateThresholdMinutes]);

  const shift = shiftQuery.data;

  const otApprovalMutation = useMutation({
    mutationFn: (body: { overtimeApproved?: boolean; overtimeRejected?: boolean }) => {
      if (!shift?.id || !record) throw new Error("Missing shift or record");
      return setShiftOvertimeApproval(shift.id, record.employeeId, body);
    },
    onSuccess: (_, body) => {
      qc.invalidateQueries({ queryKey: ["assigned-shift", record?.employeeId, record?.date.slice(0, 10)] });
      qc.invalidateQueries({ queryKey: ["overtime-attendance-ot"] });
      if (body.overtimeApproved) {
        setOtDecision("approved");
        toast("Overtime approved", "success");
      } else if (body.overtimeRejected) {
        setOtDecision("rejected");
        toast("Overtime rejected", "success");
      } else {
        setOtDecision(null);
        toast("Overtime decision undone", "success");
      }
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Adjust attendance</DialogTitle>
        <DialogDescription>
          {record
            ? `${record.employee.firstName} ${record.employee.lastName} · ${record.date.slice(0, 10)}`
            : ""}
        </DialogDescription>
      </DialogHeader>

      {/* Selfie lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div className="relative mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-3 -right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow text-gray-600 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={lightbox} alt="Selfie" className="w-full rounded-2xl object-contain shadow-2xl max-h-[75vh]" />
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-3 pt-2"
        noValidate
      >
        {/* Selfie previews */}
        {(record?.selfieIn || record?.selfieOut) && (
          <div className="flex gap-4">
            {[
              { url: record?.selfieIn, label: "Clock In" },
              { url: record?.selfieOut, label: "Clock Out" },
            ].map(({ url, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
                {url ? (
                  <button type="button" onClick={() => setLightbox(url)} className="focus:outline-none">
                    <img
                      src={url}
                      alt={label}
                      className="h-16 w-16 rounded-xl object-cover shadow ring-2 ring-gray-100 hover:ring-red-400 transition-all cursor-zoom-in"
                    />
                  </button>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100">
                    <Camera className="h-6 w-6 text-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" {...register("date")} />
          {errors.date && (
            <p className="text-xs text-destructive">{errors.date.message}</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Clock In</Label>
            <Controller
              name="clockInTime"
              control={control}
              render={({ field }) => (
                <TimePicker value={field.value} onChange={field.onChange} />
              )}
            />
            {errors.clockInTime && (
              <p className="text-xs text-destructive">{errors.clockInTime.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Clock Out</Label>
            <Controller
              name="clockOutTime"
              control={control}
              render={({ field }) => (
                <TimePicker value={field.value} onChange={field.onChange} />
              )}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if still clocked in. If earlier than clock-in, treated as next day.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Assigned Shift</Label>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {shiftQuery.isLoading
              ? <span className="text-muted-foreground italic">Loading…</span>
              : shiftQuery.data
                ? <span>{shiftQuery.data.name} &middot; {fmtShiftTime(shiftQuery.data.startTime)} – {fmtShiftTime(shiftQuery.data.endTime)}</span>
                : <span className="text-muted-foreground italic">No shift assigned</span>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status Override</Label>
          <Select id="status" {...register("status")}>
            <option value="AUTO">Auto (Late / Present)</option>
            <option value="ABSENT">Absent</option>
            <option value="HALF_DAY">Half-day</option>
            <option value="ON_LEAVE">On Leave</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Auto computes Late or Present from clock-in vs shift start. Set manually only for Absent or Half-day.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Employee Clock-in Note</Label>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {record?.clockInNote || <span className="text-muted-foreground italic">No note provided</span>}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Employee Clock-out Note</Label>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {record?.clockOutNote || <span className="text-muted-foreground italic">No note provided</span>}
          </div>
        </div>

        {attendanceSummary && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Attendance Summary
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">Late</span>
              <span className={attendanceSummary.lateMins > 0 ? "font-semibold text-amber-600" : "text-muted-foreground"}>
                {attendanceSummary.lateMins > 0 ? fmtMinutes(attendanceSummary.lateMins) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">Overtime</span>
              {attendanceSummary.otMins > 0 || overrideOtHours !== "" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="24"
                    placeholder={(attendanceSummary.otMins / 60).toFixed(1)}
                    value={overrideOtHours}
                    onChange={(e) => setOverrideOtHours(e.target.value)}
                    className={[
                      "w-20 rounded-md border px-2 py-1 text-sm font-semibold text-right",
                      otDecision === "approved" || shift?.overtimeApproved
                        ? "border-green-300 text-green-600"
                        : otDecision === "rejected" || shift?.overtimeRejected
                          ? "border-red-300 text-destructive"
                          : "border-amber-300 text-amber-600",
                    ].join(" ")}
                  />
                  <span className="text-sm font-medium text-muted-foreground">h</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {otDecision === "approved" || shift?.overtimeApproved ? "(approved)" :
                     otDecision === "rejected" || shift?.overtimeRejected ? "(rejected)" : "(pending)"}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            {(attendanceSummary.otMins > 0 || overrideOtHours !== "") && shift && (() => {
              const hasDecided = shift.overtimeApproved || shift.overtimeRejected || otDecision === "rejected" || otDecision === "approved";
              const isPending = otApprovalMutation.isPending;
              if (hasDecided) {
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (shift.overtimeApproved) {
                        otApprovalMutation.mutate({ overtimeApproved: false });
                      } else {
                        otApprovalMutation.mutate({ overtimeRejected: false });
                      }
                    }}
                    disabled={isPending}
                    className="mt-1 w-full flex items-center justify-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/70 transition-colors"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Undo
                  </button>
                );
              }
              return (
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => otApprovalMutation.mutate({ overtimeApproved: true })}
                    disabled={isPending}
                    className="flex-1 flex items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => otApprovalMutation.mutate({ overtimeRejected: true })}
                    disabled={isPending}
                    className="flex-1 flex items-center justify-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="remarks">Remarks</Label>
          <Textarea
            id="remarks"
            rows={3}
            placeholder="Reason for manual adjustment…"
            {...register("remarks")}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
