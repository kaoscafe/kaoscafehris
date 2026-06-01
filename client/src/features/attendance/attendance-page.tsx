import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { extractErrorMessage } from "@/lib/api";
import { exportToCsv } from "@/lib/export";
import { listBranches } from "@/features/branches/branches.api";
import { useToast } from "@/components/ui/toast";
import {
  formatClockTime,
  listAttendance,
  deleteAttendance,
  type AttendanceRecord,
  type AttendanceStatus,
} from "./attendance.api";
import AttendanceAdjustDialog from "./attendance-adjust-dialog";
import AttendanceAddDialog from "./attendance-add-dialog";
import { COMPANY_TZ, todayIsoLocal } from "@/lib/timezone";

const BRAND = "#8C1515";
const AMBER = "#C4843A";
const PURPLE = "#7a3db0";
const GREEN = "#4e8a40";


function formatDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}

function formatClockIn(r: AttendanceRecord, tz: string): string {
  if (r.status === "ABSENT" && r.source === "AUTO") return "—";
  if ((r.status === "ABSENT" || r.status === "ON_LEAVE") && r.source === "MANUAL") {
    const local = new Date(r.clockIn).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
    });
    if (local === "00:00") return "00:00 AM";
  }
  return formatClockTime(r.clockIn, tz);
}


function StatusBadge({ status, hasClockOut }: { status: AttendanceStatus; hasClockOut: boolean }) {
  if (!hasClockOut && (status === "PRESENT" || status === "LATE")) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#fce9e9", color: BRAND }}>
        Ongoing
        {status === "LATE" && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: AMBER, color: "#fff" }}>
            Late
          </span>
        )}
      </span>
    );
  }
  switch (status) {
    case "PRESENT": return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#edf6ea", color: GREEN }}>On Time</span>;
    case "LATE": return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#fdf0e0", color: AMBER }}>Late</span>;
    case "ABSENT": return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#fce9e9", color: BRAND }}>Absent</span>;
    case "ON_LEAVE": return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#f3e8ff", color: PURPLE }}>On Leave</span>;
    case "HALF_DAY": return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#f3e8ff", color: PURPLE }}>On Leave</span>;
    default: return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">{status}</span>;
  }
}

function dateLabel(iso: string, tz: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz });
}

export default function AttendancePage() {
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"" | "COMPLETE" | "LATE" | "INCOMPLETE" | "ABSENT">("");
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<AttendanceRecord | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const qc = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttendance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      toast("Attendance record deleted", "success");
      setDeleteTarget(null);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const branchesQuery = useQuery({
    queryKey: ["branches", { active: true }],
    queryFn: () => listBranches({ isActive: true }),
  });

  const tz = COMPANY_TZ;

  const todayWorkDay = todayIsoLocal(tz);

const apiStatus = (statusFilter === "LATE" ? "LATE" : statusFilter === "ABSENT" ? "ABSENT" : "") as AttendanceStatus | "";

  const apiFilters = useMemo(() => ({
    branchId: branchId || undefined,
    startDate: dateRangeStart,
    endDate: dateRangeEnd,
    status: apiStatus || undefined,
    search: search.trim() || undefined,
  }), [branchId, dateRangeStart, dateRangeEnd, apiStatus, search]);

  const query = useQuery({
    queryKey: ["attendance", branchId, dateRangeStart, dateRangeEnd, apiStatus, search],
    queryFn: () => listAttendance(apiFilters),
  });

  const records = useMemo(() => {
    let data = query.data ?? [];
    if (statusFilter === "COMPLETE") data = data.filter((r) => r.clockOut && r.status === "PRESENT");
    else if (statusFilter === "INCOMPLETE") data = data.filter((r) => !r.clockOut && (r.status === "PRESENT" || r.status === "LATE"));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter((r) =>
        `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase().includes(q) ||
        r.employee.employeeId.toLowerCase().includes(q)
      );
    }
    return data;
  }, [query.data, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const pageRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedBranch = branchesQuery.data?.find((b) => b.id === branchId);

  function handleExport() {
    const headers = ["Employee ID", "Name", "Position", "Date", "Clock In", "Clock Out", "Status"];
    const rows = records.map((r) => [
      r.employee.employeeId,
      `${r.employee.firstName} ${r.employee.lastName}`,
      r.employee.position ?? "",
      r.date.slice(0, 10),
      formatClockTime(r.clockIn, tz),
      r.clockOut ? formatClockTime(r.clockOut, tz) : "",
      r.status,
    ]);
    const branch = selectedBranch ? `_${selectedBranch.name.replace(/\s+/g, "_")}` : "";
    exportToCsv(`attendance${branch}_${dateRangeStart}_to_${dateRangeEnd}.csv`, headers, rows);
  }

  const summary = {
    present: records.filter(r => r.status === "PRESENT" && r.clockOut).length,
    late: records.filter(r => r.status === "LATE").length,
    absent: records.filter(r => r.status === "ABSENT").length,
    onLeave: records.filter(r => r.status === "HALF_DAY" || r.status === "ON_LEAVE").length,
    ongoing: records.filter(r => (r.status === "PRESENT" || r.status === "LATE") && !r.clockOut).length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-400 mt-1">{dateLabel(todayWorkDay, tz)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-all hover:shadow-sm disabled:opacity-50"
            style={{ borderColor: BRAND, color: BRAND }}
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            <Plus className="h-4 w-4" />
            Add Attendance
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Present", value: summary.present + summary.ongoing, color: GREEN, stagger: 1 },
          { label: "Late", value: summary.late, color: AMBER, stagger: 2 },
          { label: "Absent", value: summary.absent, color: BRAND, stagger: 3 },
          { label: "On Leave", value: summary.onLeave, color: PURPLE, stagger: 4 },
        ].map((s) => (
          <div key={s.label} className={`animate-fade-up stagger-${s.stagger} relative overflow-hidden rounded-xl bg-white p-4 shadow-sm card-hover`} style={{ borderLeft: `4px solid ${s.color}` }}>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{s.label}</p>
            <p className="font-heading text-4xl leading-none" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters bar */}
      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm items-center animate-fade-up stagger-5">
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
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 focus:outline-none"
          value={branchId}
          onChange={(e) => { setBranchId(e.target.value); setPage(1); }}
        >
          <option value="">All Branches</option>
          {branchesQuery.data?.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none"
            value={dateRangeStart}
            max={dateRangeEnd}
            onChange={(e) => { setDateRangeStart(e.target.value); setPage(1); }}
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none"
            value={dateRangeEnd}
            min={dateRangeStart}
            onChange={(e) => { setDateRangeEnd(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 focus:outline-none"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="COMPLETE">On Time</option>
          <option value="LATE">Late</option>
          <option value="INCOMPLETE">Ongoing</option>
          <option value="ABSENT">Absent</option>
        </select>
      </div>

      {/* Table */}
      <div className="animate-fade-up stagger-6 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead style={{ background: "#FDFAFA" }}>
            <tr style={{ borderBottom: "1px solid #F5EDED" }}>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Employee</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Role</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Branch</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Shift</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Date</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Time In</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Time Out</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Status</th>
              <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "#F5EDED" }}>
            {query.isLoading && (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" />
                </td>
              </tr>
            )}
            {query.isError && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-red-500">
                  {extractErrorMessage(query.error, "Failed to load attendance")}
                </td>
              </tr>
            )}
            {!query.isLoading && records.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-gray-400">
                  No records match these filters.
                </td>
              </tr>
            )}
            {pageRecords.map((r) => (
                <tr key={r.id} className="hover:bg-[#FAF0F0]/40 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold flex-shrink-0" style={{ background: "#F3E4E4", color: BRAND }}>
                        {`${r.employee.firstName[0]}${r.employee.lastName[0]}`.toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-800">{r.employee.firstName} {r.employee.lastName}</p>
                          {r.employee.employmentStatus === "TERMINATED" ? (
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-red-50 text-red-600 ring-1 ring-inset ring-red-200">
                              Terminated
                            </span>
                          ) : r.employee.dateTerminated ? (
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
                              Reactivated
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-400">{r.employee.employeeId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{r.employee.position ?? "—"}</td>
                  <td className="px-5 py-4 text-gray-600">{r.branch?.name ?? "—"}</td>
                  <td className="px-5 py-4 text-gray-600">{r.shiftName ?? "—"}</td>
                  <td className="px-5 py-4 text-gray-600">{formatDate(r.date.slice(0, 10) + "T12:00:00Z", tz)}</td>
                  <td className="px-5 py-4 tabular-nums font-medium text-gray-800">
                    <span>{formatClockIn(r, tz)}</span>
                    {r.clockInNote && (
                      <span className="ml-1.5 text-[10px] text-amber-600 cursor-help" title={r.clockInNote}>📝</span>
                    )}
                  </td>
                  <td className="px-5 py-4 tabular-nums text-gray-600">
                    {r.clockOut ? formatClockTime(r.clockOut, tz) : <span className="text-gray-300">—</span>}
                    {r.clockOutNote && (
                      <span className="ml-1.5 text-[10px] text-amber-600 cursor-help" title={r.clockOutNote}>📝</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!r.hasShift && r.clockOut
                        ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">No Shift</span>
                        : <StatusBadge status={r.status} hasClockOut={!!r.clockOut} />}
                      {r.source === "MANUAL" && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-500 ring-1 ring-inset ring-blue-200">
                          Manual
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setAdjustTarget(r)}
                        className="text-gray-400 hover:text-primary transition-colors"
                        title="Adjust"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(r)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {!query.isLoading && records.length > 0 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #F5EDED", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#aaa" }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, records.length)} of {records.length} records
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: p === page ? "none" : "1px solid #eee",
                    background: p === page ? BRAND : "#fff",
                    color: p === page ? "#fff" : "#666",
                    fontSize: 12, cursor: "pointer",
                    fontWeight: p === page ? 700 : 400,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <AttendanceAdjustDialog
        open={!!adjustTarget}
        onOpenChange={(o) => !o && setAdjustTarget(null)}
        record={adjustTarget}
      />

      <AttendanceAddDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-heading text-lg font-bold text-gray-900">Delete Attendance Record?</h3>
            <p className="mt-2 text-sm text-gray-500">
              This will permanently delete the attendance record for{" "}
              <span className="font-medium text-gray-800">
                {deleteTarget.employee.firstName} {deleteTarget.employee.lastName}
              </span>{" "}
              on{" "}
              <span className="font-medium text-gray-800">
                {new Date(deleteTarget.clockIn).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: tz })}
              </span>
              . This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: BRAND }}
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
