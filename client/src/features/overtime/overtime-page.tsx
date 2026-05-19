import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Plus, Pencil, Undo2 } from "lucide-react";

import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/features/auth/auth.store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import {
  listOvertimeRequests,
  listOvertimeSchedules,
  updateOvertimeRequest,
  updateOvertimeSchedule,
  revertOvertimeRequest,
  deleteOvertimeSchedule,
  getAttendanceOvertimeRecords,
  setShiftOvertimeApproval,
  type OvertimeRequest,
  type OvertimeSchedule,
  type OvertimeStatus,
  type AttendanceOvertimeRecord,
} from "./overtime.api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import OvertimeRequestDialog from "./overtime-request-dialog";
import OvertimeAssignDialog from "./overtime-assign-dialog";
import OvertimeReviewDialog from "./overtime-review-dialog";
import Pagination from "@/components/ui/pagination";
import { COMPANY_TZ } from "@/lib/timezone";

const BRAND = "#8C1515";

type Row =
  | { kind: "request"; data: OvertimeRequest }
  | { kind: "schedule"; data: OvertimeSchedule }
  | { kind: "attendance-ot"; data: AttendanceOvertimeRecord };

function StatCard({ label, value, color, stagger }: { label: string; value: number; color: string; stagger: number }) {
  return (
    <div className={`animate-fade-up stagger-${stagger} relative overflow-hidden rounded-xl bg-white p-5 shadow-sm card-hover`} style={{ borderLeft: `4px solid ${color}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{label}</p>
      <p className="font-heading text-4xl leading-none" style={{ color }}>{value}</p>
    </div>
  );
}

function Avatar({ first, last }: { first: string; last: string }) {
  const colors = ["#8C1515", "#2563EB", "#7C3AED", "#0891B2", "#D97706", "#16A34A"];
  const idx = (first.charCodeAt(0) + last.charCodeAt(0)) % colors.length;
  const initials = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: colors[idx] }}
    >
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: OvertimeStatus }) {
  const map: Record<OvertimeStatus, { bg: string; color: string; label: string }> = {
    PENDING:  { bg: "#FEF9C3", color: "#CA8A04", label: "Pending" },
    APPROVED: { bg: "#DCFCE7", color: "#16A34A", label: "Approved" },
    REJECTED: { bg: "#FEE2E2", color: "#DC2626", label: "Rejected" },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: COMPANY_TZ,
  });
}

function ViewOvertimeDialog({ row, open, onOpenChange, canEdit }: { row: Row | null; open: boolean; onOpenChange: (open: boolean) => void; canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOtHours, setEditOtHours] = useState("");

  useEffect(() => {
    if (!row) return;
    const d = row.data;
    setEditDate(d.date.slice(0, 10));
    if (row.kind === "request") {
      setEditStartTime((d as OvertimeRequest).startTime ?? "");
      setEditEndTime((d as OvertimeRequest).endTime ?? "");
      setEditReason((d as OvertimeRequest).reason ?? "");
      setEditOtHours((d as OvertimeRequest).otHours ?? "");
    } else if (row.kind === "schedule") {
      setEditStartTime((d as OvertimeSchedule).startTime);
      setEditEndTime((d as OvertimeSchedule).endTime);
      setEditNotes((d as OvertimeSchedule).notes ?? "");
      setEditOtHours((d as OvertimeSchedule).otHours ?? "");
    }
  }, [row]);

  const updateRequestMut = useMutation({
    mutationFn: (id: string) =>
      updateOvertimeRequest(id, {
        date: editDate,
        startTime: editStartTime || undefined,
        endTime: editEndTime || undefined,
        reason: editReason,
        otHours: editOtHours ? Number(editOtHours) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime"] });
      toast("Overtime request updated", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const updateScheduleMut = useMutation({
    mutationFn: (id: string) =>
      updateOvertimeSchedule(id, {
        date: editDate,
        startTime: editStartTime,
        endTime: editEndTime,
        notes: editNotes || undefined,
        otHours: editOtHours ? Number(editOtHours) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-schedules"] });
      toast("Schedule updated", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const revertRequestMut = useMutation({
    mutationFn: (id: string) => revertOvertimeRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime"] });
      toast("Overtime request reverted", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteScheduleMut = useMutation({
    mutationFn: (id: string) => deleteOvertimeSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-schedules"] });
      toast("Schedule removed", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const revertAttendanceOtMut = useMutation({
    mutationFn: ({ shiftId, employeeId }: { shiftId: string; employeeId: string }) =>
      setShiftOvertimeApproval(shiftId, employeeId, { overtimeApproved: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-attendance-ot"] });
      toast("Overtime approval reverted", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const approveAttendanceOtMut = useMutation({
    mutationFn: ({ shiftId, employeeId }: { shiftId: string; employeeId: string }) =>
      setShiftOvertimeApproval(shiftId, employeeId, { overtimeApproved: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-attendance-ot"] });
      toast("Overtime approved", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const rejectAttendanceOtMut = useMutation({
    mutationFn: ({ shiftId, employeeId }: { shiftId: string; employeeId: string }) =>
      setShiftOvertimeApproval(shiftId, employeeId, { overtimeRejected: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-attendance-ot"] });
      toast("Overtime rejected", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (!row) return null;
  const d = row.data;

  const isRequest = row.kind === "request";
  const isSchedule = row.kind === "schedule";
  const isAttendanceOt = row.kind === "attendance-ot";

  const requestData = isRequest ? (d as OvertimeRequest) : null;
  const scheduleData = isSchedule ? (d as OvertimeSchedule) : null;
  const attOtData = isAttendanceOt ? (d as AttendanceOvertimeRecord) : null;

  const canRevert =
    isRequest
      ? requestData!.status === "APPROVED" || requestData!.status === "REJECTED"
      : isSchedule
        ? true
        : isAttendanceOt
          ? (attOtData!.overtimeApproved || attOtData!.overtimeRejected) && !!attOtData!.shiftId
          : false;

  const canApproveAttendanceOt =
    isAttendanceOt && !attOtData!.overtimeApproved && !attOtData!.overtimeRejected && !!attOtData!.shiftId;

  const showTimes = isSchedule || (isRequest && requestData!.startTime && requestData!.endTime) || (canEdit && !isAttendanceOt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>
          {d.employee.firstName} {d.employee.lastName}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-gray-400">OT Date</p>
            {canEdit ? (
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="mt-0.5 text-sm" />
            ) : (
              <p className="font-medium text-gray-800">{d.date.slice(0, 10)}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400">Type</p>
            <p className="font-medium text-gray-800">
              {isRequest ? "Request" : isSchedule ? "Assigned" : "Attendance Overtime"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Branch</p>
            <p className="font-medium text-gray-800">{d.employee.branch?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Position</p>
            <p className="font-medium text-gray-800">{d.employee.position}</p>
          </div>
        </div>

        {showTimes && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-gray-400">Start Time</p>
              {canEdit ? (
                <TimePicker value={editStartTime} onChange={setEditStartTime} />
              ) : (
                <p className="font-medium text-gray-800">{isSchedule ? fmt12(scheduleData!.startTime) : fmt12(requestData!.startTime!)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400">End Time</p>
              {canEdit ? (
                <TimePicker value={editEndTime} onChange={setEditEndTime} />
              ) : (
                <p className="font-medium text-gray-800">{isSchedule ? fmt12(scheduleData!.endTime) : fmt12(requestData!.endTime!)}</p>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-400">OT Hours</p>
          {canEdit && !isAttendanceOt ? (
            <Input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              value={editOtHours}
              onChange={(e) => setEditOtHours(e.target.value)}
              className="mt-0.5 text-sm"
            />
          ) : (
            <p className="font-medium text-gray-800">
              {isAttendanceOt
                ? `${Number(attOtData!.overtimeHours).toFixed(2)}h`
                : (d as OvertimeRequest | OvertimeSchedule).otHours
                  ? `${Number((d as OvertimeRequest | OvertimeSchedule).otHours!).toFixed(2)}h`
                  : "—"}
            </p>
          )}
        </div>

        {isRequest && (
          <>
            <div>
              <p className="text-xs text-gray-400">Status</p>
              <p className="font-medium text-gray-800">
                <StatusBadge status={requestData!.status} />
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Reason</p>
              {canEdit ? (
                <Textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} className="mt-0.5 text-sm" rows={3} maxLength={500} />
              ) : (
                <p className="text-gray-700 whitespace-pre-wrap">{requestData!.reason}</p>
              )}
            </div>
            {requestData!.reviewNotes && (
              <div>
                <p className="text-xs text-gray-400">Review Notes</p>
                <p className="text-gray-700 whitespace-pre-wrap">{requestData!.reviewNotes}</p>
              </div>
            )}
          </>
        )}

        {isSchedule && (
          <div>
            <p className="text-xs text-gray-400">Notes</p>
            {canEdit ? (
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="mt-0.5 text-sm" rows={2} maxLength={500} />
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">{scheduleData!.notes || "—"}</p>
            )}
          </div>
        )}

        {isAttendanceOt && (
          <div>
            <p className="text-xs text-gray-400">Status</p>
            <p className="font-medium text-gray-800">
              {attOtData!.overtimeApproved
                ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#DCFCE7", color: "#16A34A" }}>Approved</span>
                : attOtData!.overtimeRejected
                  ? <StatusBadge status="REJECTED" />
                  : <StatusBadge status="PENDING" />}
            </p>
          </div>
        )}
      </div>

      {canEdit && (
        <DialogFooter className="mt-4">
          {canApproveAttendanceOt && (
            <div className="flex gap-2">
              <button
                onClick={() => approveAttendanceOtMut.mutate({ shiftId: attOtData!.shiftId!, employeeId: attOtData!.employee.id })}
                disabled={approveAttendanceOtMut.isPending || rejectAttendanceOtMut.isPending}
                className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
              >
                {approveAttendanceOtMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Approve
              </button>
              <button
                onClick={() => rejectAttendanceOtMut.mutate({ shiftId: attOtData!.shiftId!, employeeId: attOtData!.employee.id })}
                disabled={approveAttendanceOtMut.isPending || rejectAttendanceOtMut.isPending}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {rejectAttendanceOtMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Reject
              </button>
            </div>
          )}
          {canRevert && (
            <button
              onClick={() => {
                if (isRequest) revertRequestMut.mutate(requestData!.id);
                else if (isSchedule) deleteScheduleMut.mutate(scheduleData!.id);
                else if (isAttendanceOt) {
                  if (attOtData!.overtimeRejected) {
                    // Revert rejection: clear the rejected flag
                    setShiftOvertimeApproval(attOtData!.shiftId!, attOtData!.employee.id, { overtimeRejected: false })
                      .then(() => { qc.invalidateQueries({ queryKey: ["overtime-attendance-ot"] }); toast("Overtime rejection reverted", "success"); onOpenChange(false); })
                      .catch((err) => toast(extractErrorMessage(err), "error"));
                  } else {
                    revertAttendanceOtMut.mutate({ shiftId: attOtData!.shiftId!, employeeId: attOtData!.employee.id });
                  }
                }
              }}
              disabled={revertRequestMut.isPending || deleteScheduleMut.isPending || revertAttendanceOtMut.isPending}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {(revertRequestMut.isPending || deleteScheduleMut.isPending || revertAttendanceOtMut.isPending) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="h-3.5 w-3.5" />
              )}
              Revert
            </button>
          )}
          {!isAttendanceOt && (
            <Button
              onClick={() => {
                if (isRequest) updateRequestMut.mutate(requestData!.id);
                else if (isSchedule) updateScheduleMut.mutate(scheduleData!.id);
              }}
              disabled={updateRequestMut.isPending || updateScheduleMut.isPending}
            >
              {(updateRequestMut.isPending || updateScheduleMut.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Update
            </Button>
          )}
        </DialogFooter>
      )}
    </Dialog>
  );
}

export default function OvertimePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const canReview = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isEmployee = user?.role === "EMPLOYEE";

  const [statusFilter, setStatusFilter] = useState<"" | OvertimeStatus | "ASSIGNED">(canReview ? "" : "");
  const [search, setSearch] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editing, setEditing] = useState<OvertimeSchedule | null>(null);
  const [revertTarget, setRevertTarget] = useState<OvertimeRequest | null>(null);
  const [reviewTarget, setReviewTarget] = useState<OvertimeRequest | null>(null);
  const [reviewInitialStatus, setReviewInitialStatus] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [viewRow, setViewRow] = useState<Row | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const requestsQuery = useQuery({
    queryKey: ["overtime"],
    queryFn: () => listOvertimeRequests({}),
  });

  const schedulesQuery = useQuery({
    queryKey: ["overtime-schedules"],
    queryFn: () => listOvertimeSchedules(),
    enabled: canReview,
  });

  const attendanceOtQuery = useQuery({
    queryKey: ["overtime-attendance-ot"],
    queryFn: () => getAttendanceOvertimeRecords(),
    enabled: canReview,
  });

  const attendanceOtApprove = useMutation({
    mutationFn: ({ shiftId, employeeId, approved }: { shiftId: string; employeeId: string; approved: boolean }) =>
      setShiftOvertimeApproval(shiftId, employeeId, approved ? { overtimeApproved: true } : { overtimeApproved: false }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["overtime-attendance-ot"] });
      toast(vars.approved ? "Overtime approved" : "Overtime approval reverted", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const attendanceOtReject = useMutation({
    mutationFn: ({ shiftId, employeeId }: { shiftId: string; employeeId: string }) =>
      setShiftOvertimeApproval(shiftId, employeeId, { overtimeRejected: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overtime-attendance-ot"] });
      toast("Overtime rejected", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const rows = useMemo<Row[]>(() => {
    const requests: Row[]     = (requestsQuery.data ?? []).map((d) => ({ kind: "request", data: d }));
    const schedules: Row[]    = (schedulesQuery.data ?? []).map((d) => ({ kind: "schedule", data: d }));
    const attOt: Row[]        = canReview ? (attendanceOtQuery.data ?? []).map((d) => ({ kind: "attendance-ot" as const, data: d })) : [];
    let combined = [...requests, ...schedules, ...attOt];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      combined = combined.filter((r) => {
        const emp = r.data.employee;
        return `${emp.firstName} ${emp.lastName} ${emp.employeeId}`.toLowerCase().includes(q);
      });
    }

    if (statusFilter === "ASSIGNED") {
      combined = combined.filter((r) => r.kind === "schedule");
    } else if (statusFilter === "PENDING") {
      combined = combined.filter(
        (r) => r.kind === "request" && r.data.status === "PENDING"
      );
    } else if (statusFilter === "APPROVED") {
      combined = combined.filter(
        (r) => r.kind === "schedule" ||
            (r.kind === "request" && r.data.status === "APPROVED") ||
            (r.kind === "attendance-ot" && r.data.overtimeApproved)
      );
    } else if (statusFilter === "REJECTED") {
      combined = combined.filter(
        (r) => (r.kind === "request" && r.data.status === "REJECTED") ||
               (r.kind === "attendance-ot" && r.data.overtimeRejected)
      );
    } else {
      // "All Statuses" – hide attendance-ot that hasn't been decided yet
      combined = combined.filter((r) =>
        r.kind !== "attendance-ot" || r.data.overtimeApproved || r.data.overtimeRejected
      );
    }

    combined.sort((a, b) => b.data.date.slice(0, 10).localeCompare(a.data.date.slice(0, 10)));
    return combined;
  }, [requestsQuery.data, schedulesQuery.data, attendanceOtQuery.data, search, statusFilter, canReview]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRecords = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const revert = useMutation({
    mutationFn: (r: OvertimeRequest) => revertOvertimeRequest(r.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["overtime"] }); toast("Overtime request reverted", "success"); setRevertTarget(null); },
    onError: (err) => { toast(extractErrorMessage(err), "error"); setRevertTarget(null); },
  });

  const allRequests = requestsQuery.data ?? [];
  const stats = useMemo(() => ({
    pending:  allRequests.filter((r) => r.status === "PENDING").length,
    approved: allRequests.filter((r) => r.status === "APPROVED").length,
    rejected: allRequests.filter((r) => r.status === "REJECTED").length,
    total:    allRequests.length,
  }), [allRequests]);

  const isLoading = requestsQuery.isLoading || (canReview && schedulesQuery.isLoading) || (canReview && attendanceOtQuery.isLoading);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Overtime</h1>
          <p className="text-sm text-gray-400 mt-1">{todayLabel()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEmployee && (
            <button
              onClick={() => setRequestOpen(true)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              <Plus className="h-4 w-4" />
              Request Overtime
            </button>
          )}
          {canReview && (
            <button
              onClick={() => { setEditing(null); setAssignOpen(true); }}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              <Plus className="h-4 w-4" />
              Assign Overtime
            </button>
          )}
        </div>
      </div>

      {/* Stat cards — admin/manager only */}
      {!isEmployee && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Pending"  value={stats.pending}  color="#CA8A04" stagger={1} />
          <StatCard label="Approved" value={stats.approved} color="#16A34A" stagger={2} />
          <StatCard label="Rejected" value={stats.rejected} color="#DC2626" stagger={3} />
          <StatCard label="Total"    value={stats.total}    color={BRAND}   stagger={4} />
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm animate-fade-up stagger-5">
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
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700"
        >
          <option value="">All Statuses</option>
          <option value="ASSIGNED">Assigned OT</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="animate-fade-up overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead style={{ background: "#FDFAFA" }}>
            <tr style={{ borderBottom: "1px solid #F5EDED" }}>
              {!isEmployee && <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Employee</th>}
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">OT Date</th>
              {!isEmployee && <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Branch</th>}
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Type</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">OT Time</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Reason</th>
              <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-gray-300">OT Hours</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Status</th>
              {canReview && <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "#F5EDED" }}>
            {isLoading && (
              <tr>
                <td colSpan={(!isEmployee ? 2 : 0) + 6 + (canReview ? 1 : 0)} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" />
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={(!isEmployee ? 2 : 0) + 6 + (canReview ? 1 : 0)} className="py-12 text-center text-sm text-gray-400">
                  No overtime records found.
                </td>
              </tr>
            )}
            {!isLoading && pageRecords.map((row) => {
              if (row.kind === "request") {
                const r = row.data;
                return (
                  <tr key={`req-${r.id}`} className="hover:bg-gray-50/60">
                    {!isEmployee && (
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar first={r.employee.firstName} last={r.employee.lastName} />
                          <div>
                            <p className="font-semibold text-gray-800 leading-tight">{r.employee.firstName} {r.employee.lastName}</p>
                            <p className="text-xs text-gray-400">{r.employee.position}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-5 py-4 text-gray-600 tabular-nums">{r.date.slice(0, 10)}</td>
                    {!isEmployee && <td className="px-5 py-4 text-gray-600">{r.employee.branch?.name ?? "—"}</td>}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        Request
                      </span>
                    </td>
                    <td className="px-5 py-4 tabular-nums text-gray-600 text-xs">
                      {r.startTime && r.endTime ? `${fmt12(r.startTime)} – ${fmt12(r.endTime)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-4 max-w-[200px]">
                      <p className="truncate text-gray-600">{r.reason}</p>
                      {r.reviewNotes && (
                        <p className="text-xs text-gray-400 italic mt-0.5">Note: {r.reviewNotes}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-gray-800">
                      {r.otHours ? `${Number(r.otHours).toFixed(2)}h` : <span className="text-gray-300 font-normal">—</span>}
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={r.status} /></td>
                    {canReview && (
                      <td className="px-5 py-4">
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => setViewRow({ kind: "request", data: r })}
                            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50"
                            title="View details"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {r.status === "PENDING" ? (
                            <>
                              <button
                                onClick={() => { setReviewInitialStatus("APPROVED"); setReviewTarget(r); }}
                                className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => { setReviewInitialStatus("REJECTED"); setReviewTarget(r); }}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                                style={{ backgroundColor: BRAND }}
                              >
                                Reject
                              </button>
                            </>
                          ) : (r.status === "APPROVED" || r.status === "REJECTED") ? (
                            <button
                              onClick={() => setRevertTarget(r)}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                            >
                              Revert
                            </button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              }

              if (row.kind === "attendance-ot") {
                const r = row.data;
                return (
                  <tr key={`att-ot-${r.id}`} className="hover:bg-gray-50/60">
                    {!isEmployee && (
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar first={r.employee.firstName} last={r.employee.lastName} />
                          <div>
                            <p className="font-semibold text-gray-800 leading-tight">{r.employee.firstName} {r.employee.lastName}</p>
                            <p className="text-xs text-gray-400">{r.employee.position}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-5 py-4 text-gray-600 tabular-nums">{r.date.slice(0, 10)}</td>
                    {!isEmployee && <td className="px-5 py-4 text-gray-600">{r.employee.branch.name}</td>}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        Request
                      </span>
                    </td>
                    <td className="px-5 py-4 tabular-nums text-xs text-gray-300">—</td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-medium text-gray-500 italic">Attendance Overtime</p>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-gray-800">
                      {Number(r.overtimeHours).toFixed(2)}h
                    </td>
                    <td className="px-5 py-4">
                      {r.overtimeApproved
                        ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#DCFCE7", color: "#16A34A" }}>Approved</span>
                        : r.overtimeRejected
                        ? <StatusBadge status="REJECTED" />
                        : <StatusBadge status="PENDING" />}
                    </td>
                    {canReview && (
                      <td className="px-5 py-4">
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => setViewRow({ kind: "attendance-ot", data: r })}
                            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50"
                            title="View details"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {r.shiftId && r.overtimeApproved ? (
                            <button
                              onClick={() => attendanceOtApprove.mutate({ shiftId: r.shiftId!, employeeId: r.employee.id, approved: false })}
                              disabled={attendanceOtApprove.isPending}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            >
                              Revert
                            </button>
                          ) : r.shiftId && !r.overtimeRejected ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => attendanceOtApprove.mutate({ shiftId: r.shiftId!, employeeId: r.employee.id, approved: true })}
                                disabled={attendanceOtApprove.isPending || attendanceOtReject.isPending}
                                className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => attendanceOtReject.mutate({ shiftId: r.shiftId!, employeeId: r.employee.id })}
                                disabled={attendanceOtApprove.isPending || attendanceOtReject.isPending}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                                style={{ backgroundColor: BRAND }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">{r.overtimeRejected ? "Rejected" : "No shift"}</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              }

              const s = row.data;
              return (
                <tr key={`sched-${s.id}`} className="hover:bg-gray-50/60">
                  {!isEmployee && (
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar first={s.employee.firstName} last={s.employee.lastName} />
                        <div>
                          <p className="font-semibold text-gray-800 leading-tight">{s.employee.firstName} {s.employee.lastName}</p>
                          <p className="text-xs text-gray-400">{s.employee.position}</p>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-5 py-4 text-gray-600 tabular-nums">{s.date.slice(0, 10)}</td>
                  {!isEmployee && <td className="px-5 py-4 text-gray-600">{s.employee.branch?.name ?? "—"}</td>}
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      Assigned
                    </span>
                  </td>
                  <td className="px-5 py-4 tabular-nums text-gray-600 text-xs">
                    {fmt12(s.startTime)} – {fmt12(s.endTime)}
                  </td>
                  <td className="px-5 py-4">
                    {s.notes && <p className="text-xs text-gray-400">{s.notes}</p>}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums text-gray-800">
                    {s.otHours ? `${Number(s.otHours).toFixed(2)}h` : <span className="text-gray-300 font-normal">—</span>}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status="APPROVED" /></td>
                  {canReview && (
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setViewRow({ kind: "schedule", data: s })}
                        className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50"
                        title="View details"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && rows.length > 0 && (
          <Pagination page={page} totalPages={totalPages} totalRecords={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        )}
      </div>

      <ViewOvertimeDialog row={viewRow} open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)} canEdit={canReview} />
      <OvertimeRequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
      <OvertimeAssignDialog
        open={assignOpen}
        onOpenChange={(v) => { setAssignOpen(v); if (!v) setEditing(null); }}
        editing={editing}
      />

      <OvertimeReviewDialog
        open={!!reviewTarget}
        onOpenChange={(o) => !o && setReviewTarget(null)}
        request={reviewTarget}
        initialStatus={reviewInitialStatus}
      />

      <ConfirmDialog
        open={!!revertTarget}
        onOpenChange={(o) => !o && setRevertTarget(null)}
        title="Revert overtime request?"
        description={
          revertTarget
            ? `This will set ${revertTarget.employee.firstName} ${revertTarget.employee.lastName}'s overtime request for ${revertTarget.date.slice(0, 10)} back to Pending.`
            : ""
        }
        confirmLabel="Revert"
        onConfirm={() => revertTarget && revert.mutate(revertTarget)}
        loading={revert.isPending}
      />
    </div>
  );
}
