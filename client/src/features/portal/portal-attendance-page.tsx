import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Clock, Loader2 } from "lucide-react";
import { formatLocalTime, getMyAttendance, type PortalAttendance } from "./portal.api";
import { COMPANY_TZ } from "@/lib/timezone";

const BRAND = "#8C1515";
const PURPLE = "#7C3AED";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatusBadge({ record }: { record: PortalAttendance }) {
  const hasClockOut = !!record.clockOut;

  if (record.status === "LATE") {
    return (
      <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#FEF3C7", color: "#D97706" }}>
        Late
      </span>
    );
  }
  if (record.status === "ABSENT") {
    return (
      <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#FCE7F3", color: "#9D174D" }}>
        Absent
      </span>
    );
  }
  if (record.status === "ON_LEAVE") {
    return (
      <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: "#F3E8FF", color: PURPLE }}>
        On Leave
      </span>
    );
  }
  if (!hasClockOut && (record.status === "PRESENT")) {
    return (
      <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
        Ongoing
      </span>
    );
  }
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
      Complete
    </span>
  );
}

function fmtDate(dateIso: string) {
  const d = new Date(dateIso + "T00:00:00");
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

function dayOf(dateIso: string) {
  return DAY_SHORT[new Date(dateIso + "T00:00:00").getDay()];
}

function AttendanceCard({ record, tz }: { record: PortalAttendance; tz: string }) {
  const dateStr = record.date.slice(0, 10);
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: "#FAF0F0" }}>
            <CalendarDays className="h-5 w-5" style={{ color: BRAND }} />
          </div>
          <p className="font-semibold text-gray-800">{fmtDate(dateStr)}</p>
        </div>
        <StatusBadge record={record} />
      </div>

      <div className="flex items-start gap-2.5 mb-2">
        <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-gray-700">
            {formatLocalTime(record.clockIn, tz)}
            {record.clockOut ? ` – ${formatLocalTime(record.clockOut, tz)}` : ""}
          </p>
          <div className="flex gap-3 mt-0.5">
            <span className="text-xs text-gray-400">{dayOf(dateStr)}</span>
            {record.clockOut && (
              <span className="text-xs text-gray-400">
                {dayOf(record.clockOut.slice(0, 10))}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
          <span className="text-sm text-gray-600">{record.branch.name}</span>
        </div>
        {record.source === "MANUAL" && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-500 ring-1 ring-inset ring-blue-200">
            Manual Entry
          </span>
        )}
      </div>
    </div>
  );
}

export default function PortalAttendancePage() {
  const now = new Date();
  const [start, setStart] = useState(() => {
    const d = now;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [end, setEnd] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const query = useQuery({
    queryKey: ["portal-attendance", start, end],
    queryFn: () => getMyAttendance({ startDate: start, endDate: end }),
  });

  const tz = COMPANY_TZ;

  return (
    <div>
      {/* Header */}
      <div className="rounded-b-[28px] px-6 pt-14 pb-6" style={{ backgroundColor: BRAND }}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Attendance History</h1>
          <img src="/kaos-logo.svg" alt="KAOS" className="h-10 w-auto brightness-0 invert opacity-60" />
        </div>
      </div>

      <div className="px-4 pt-5 pb-24 space-y-4">
        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            className="flex-1 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 shadow-sm focus:outline-none"
          />
          <span className="text-xs text-gray-400 shrink-0">to</span>
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
            className="flex-1 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 shadow-sm focus:outline-none"
          />
        </div>

        {/* List */}
        {query.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : query.data?.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            No attendance records for this period.
          </div>
        ) : (
          <div className="space-y-3">
            {(query.data ?? []).map((r) => (
              <AttendanceCard key={r.id} record={r} tz={tz} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
