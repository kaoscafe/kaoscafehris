import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, Users } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/auth.store";
import { listBranches } from "@/features/branches/branches.api";
import { listEmployees } from "@/features/employees/employees.api";
import { listAttendance } from "@/features/attendance/attendance.api";
import { listRequests } from "@/features/leave/leave.api";
import { getPayrollReport } from "@/features/reports/report.api";
import { extractErrorMessage } from "@/lib/api";
import { COMPANY_TZ, todayIsoLocal } from "@/lib/timezone";

const BRAND = "#8C1515";
const ROSE = "#a28587";
const AMBER = "#C17A2A";
const GREEN = "#4e8a40";

function daysAgoIso(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const d2 = new Date(Date.UTC(y, m - 1, d - days));
  return `${d2.getUTCFullYear()}-${String(d2.getUTCMonth() + 1).padStart(2, "0")}-${String(d2.getUTCDate()).padStart(2, "0")}`;
}

/** Return the Sunday (YYYY-MM-DD) of the week containing `today`. */
function weekSundayIso(today: string): string {
  return daysAgoIso(today, new Date(today + "T00:00:00Z").getUTCDay());
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  label,
  value,
  accentColor,
  icon,
  stagger,
  sub,
}: {
  label: string;
  value: string | number;
  accentColor: string;
  icon: React.ReactNode;
  stagger: number;
  sub?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-white shadow-sm card-hover animate-fade-up stagger-${stagger}`}
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
            <p className="mt-2 font-heading text-4xl leading-none" style={{ color: accentColor }}>
              {value}
            </p>
            {sub && <p className="mt-1.5 text-xs text-gray-400">{sub}</p>}
          </div>
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: accentColor + "14" }}
          >
            {icon}
          </div>
        </div>
      </div>
      {/* subtle gradient shimmer */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ background: `radial-gradient(circle at 100% 0%, ${accentColor}, transparent 60%)` }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "ADMIN";
  const isAdminOrManager = isAdmin || user?.role === "MANAGER";
  const [branchFilter, setBranchFilter] = useState("");

  const tz = COMPANY_TZ;
  const today = useMemo(() => todayIsoLocal(tz), [tz]);

  const branchesQuery = useQuery({
    queryKey: ["branches", {}],
    queryFn: () => listBranches(),
    enabled: isAdmin,
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", {}],
    queryFn: () => listEmployees(),
    enabled: isAdmin,
  });

  const todayAttendanceQuery = useQuery({
    queryKey: ["attendance", { date: today }],
    queryFn: () => listAttendance({ date: today }),
    enabled: isAdminOrManager && !!today,
  });

  const weekSunday = useMemo(() => weekSundayIso(today), [today]);
  const weekSaturday = useMemo(() => daysAgoIso(weekSunday, -6), [weekSunday]);

  const weekAttendanceQuery = useQuery({
    queryKey: ["attendance", { startDate: weekSunday, endDate: weekSaturday }],
    queryFn: () => listAttendance({ startDate: weekSunday, endDate: weekSaturday }),
    enabled: isAdminOrManager && !!today,
  });

  const leaveRequestsQuery = useQuery({
    queryKey: ["leave-requests", { status: "PENDING" }],
    queryFn: () => listRequests({ status: "PENDING" }),
    enabled: isAdmin,
  });

  const sixMonthsAgo = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 7, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }, [today]);

  const payrollReportQuery = useQuery({
    queryKey: ["reports", "payroll", { periodStart: sixMonthsAgo, periodEnd: today }],
    queryFn: () => getPayrollReport({ periodStart: sixMonthsAgo, periodEnd: today }),
    enabled: isAdmin,
  });

  const totalEmployees =
    employeesQuery.data?.filter((e) => e.position !== "Administrator").length ?? 0;
  const presentToday =
    todayAttendanceQuery.data?.filter(
      (a) => a.status === "PRESENT" || a.status === "LATE"
    ).length ?? 0;
  const lateToday =
    todayAttendanceQuery.data?.filter((a) => a.status === "LATE").length ?? 0;
  const pendingLeave = leaveRequestsQuery.data?.length ?? 0;

  const attendanceChartData = useMemo(() => {
    const records = weekAttendanceQuery.data ?? [];
    const dateMap = new Map<string, { present: number; late: number; absent: number }>();
    for (let i = 0; i < 7; i++) {
      const date = daysAgoIso(weekSunday, -i);
      dateMap.set(date, { present: 0, late: 0, absent: 0 });
    }
    records.forEach(r => {
      // r.date is a full ISO datetime from the API; extract the date-only part
      const date = r.date?.slice(0, 10) || today;
      const entry = dateMap.get(date) || { present: 0, late: 0, absent: 0 };
      if (r.status === "PRESENT") entry.present++;
      else if (r.status === "LATE") { entry.present++; entry.late++; }
      else if (r.status === "ABSENT") entry.absent++;
      dateMap.set(date, entry);
    });
    return Array.from(dateMap.entries()).map(([date, counts]) => ({
      date, ...counts,
    }));
  }, [weekAttendanceQuery.data]);

  const payrollChartData = useMemo(() => {
    const runs = payrollReportQuery.data?.runs ?? [];
    const monthMap = new Map<number, { gross: number; net: number; deductions: number }>();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (const run of runs) {
      // Parse periodStart as UTC date to avoid browser-local timezone skew
      const m = parseInt(run.periodStart.split("-")[1], 10) - 1; // zero-indexed month
      const entry = monthMap.get(m) ?? { gross: 0, net: 0, deductions: 0 };
      entry.gross += run.totalGross;
      entry.net += run.totalNet;
      entry.deductions += run.totalDeductions;
      monthMap.set(m, entry);
    }
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([m, vals]) => ({ month: months[m], ...vals }));
  }, [payrollReportQuery.data]);

  const displayName = user?.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user?.email?.split("@")[0] ?? "User";

  const branches = branchesQuery.data ?? [];
  const attendanceData = todayAttendanceQuery.data ?? [];

  const recentActivity = attendanceData
    .filter((a) => a.clockIn)
    .sort((a, b) => (b.clockIn > a.clockIn ? 1 : -1))
    .slice(0, 5);

  if (!isAdminOrManager) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 md:px-8">
        <div className="animate-fade-up">
          <h1 className="font-heading text-3xl font-bold text-gray-900">
            {getGreeting()}, {displayName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Welcome to KAOS Cafe HRIS.</p>
        </div>
        <div className="animate-fade-up stagger-2 rounded-2xl bg-white p-6 shadow-sm" style={{ borderLeft: `4px solid ${BRAND}` }}>
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="font-semibold text-gray-800">{displayName}</p>
              <p className="text-sm text-gray-500">{user?.role} · {user?.employee?.position}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-8">

      {/* Page header */}
      <div className="animate-fade-up">
        <h1 className="font-heading text-3xl font-bold text-gray-900">Dashboard</h1>
      </div>

      {/* Stat cards */}
      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Employees"
            value={totalEmployees}
            accentColor={BRAND}
            stagger={1}
            icon={<Users className="h-5 w-5" style={{ color: BRAND }} />}
          />
          <StatCard
            label="Present Today"
            value={presentToday}
            accentColor={GREEN}
            stagger={2}
            sub={totalEmployees > 0 ? `${Math.round((presentToday / totalEmployees) * 100)}% attendance rate` : undefined}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={GREEN}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Pending Leave"
            value={pendingLeave}
            accentColor={ROSE}
            stagger={3}
            sub="Awaiting approval"
            icon={<AlertCircle className="h-5 w-5" style={{ color: ROSE }} />}
          />
          <StatCard
            label="Late Today"
            value={lateToday}
            accentColor={AMBER}
            stagger={4}
            icon={<Clock className="h-5 w-5" style={{ color: AMBER }} />}
          />
        </div>
      )}

      {/* Filters strip */}
      <div className="animate-fade-up stagger-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-5 py-3.5 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-300">Filter</span>
        <div className="h-4 w-px bg-gray-100" />
        <select className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-primary">
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
        </select>
        <Select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-primary"
        >
          <option value="">All Branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Attendance Overview */}
        <div className="animate-fade-up stagger-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-lg text-gray-900">Attendance Overview</h2>
              <p className="text-xs text-gray-400 mt-0.5">Current week</p>
            </div>
            <div className="flex gap-3">
              {[[BRAND, "Present"], [ROSE, "Late"], [AMBER, "Absent"]].map(([c, l]) => (
                <div key={l as string} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ background: c as string }} />
                  <span className="text-[11px] text-gray-400">{l}</span>
                </div>
              ))}
            </div>
          </div>
          {weekAttendanceQuery.isLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <AttendanceTrendChart data={attendanceChartData} />
          )}
        </div>

        {/* Payroll Trend */}
        <div className="animate-fade-up stagger-5 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-lg text-gray-900">Payroll Trend</h2>
              <p className="text-xs text-gray-400 mt-0.5">Monthly overview</p>
            </div>
            <div className="flex gap-3">
              {[[BRAND, "Gross"], [GREEN, "Net"], [AMBER, "Deductions"]].map(([c, l]) => (
                <div key={l as string} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ background: c as string }} />
                  <span className="text-[11px] text-gray-400">{l}</span>
                </div>
              ))}
            </div>
          </div>
          {payrollReportQuery.isLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : payrollReportQuery.isError ? (
            <p className="text-sm text-red-500">{extractErrorMessage(payrollReportQuery.error, "Failed to load payroll data")}</p>
          ) : (
            <PayrollBarChart data={payrollChartData} />
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="animate-fade-up stagger-6 rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "#F5EDED" }}>
          <div>
            <h2 className="font-heading text-lg text-gray-900">Recent Activity</h2>
            <p className="text-xs text-gray-400 mt-0.5">Today's clock-ins</p>
          </div>
          {recentActivity.length > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: "#F3E4E4", color: BRAND }}>
              {recentActivity.length} records
            </span>
          )}
        </div>
        {recentActivity.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-400">No clock-ins today yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #F5EDED", backgroundColor: "#FDFAFA" }}>
                {["Employee", "Position", "Action", "Time", "Status"].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((a, idx) => {
                const status = a.status || "PRESENT";
                const statusMap: Record<string, { bg: string; color: string; label: string }> = {
                  PRESENT: { bg: "#edf6ea", color: GREEN, label: "On Time" },
                  LATE: { bg: "#fdf0e0", color: AMBER, label: "Late" },
                  ABSENT: { bg: "#fce9e9", color: BRAND, label: "Absent" },
                };
                const bs = statusMap[status] ?? { bg: "#f0f0f0", color: "#555", label: status };
                return (
                  <tr
                    key={a.id}
                    className="transition-colors hover:bg-[#FAF5F5]"
                    style={{ borderBottom: idx < recentActivity.length - 1 ? "1px solid #F5EDED" : "none" }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: "#F3E4E4", color: BRAND }}>
                          {`${a.employee.firstName[0]}${a.employee.lastName[0]}`.toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-800">{a.employee.firstName} {a.employee.lastName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs">{a.employee.position}</td>
                    <td className="px-5 py-3.5 text-gray-500">Clocked In</td>
                    <td className="px-5 py-3.5 font-medium tabular-nums text-gray-600">
                      {a.clockIn
                        ? new Date(a.clockIn).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                            timeZone: tz,
                          })
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: bs.bg, color: bs.color }}>
                        {bs.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AttendanceTrendChart({ data }: { data: Array<{ date: string; present: number; late: number; absent: number }> }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No attendance data available.</p>;
  }

  const present = data.map(d => d.present);
  const late = data.map(d => d.late);
  const absent = data.map(d => d.absent);
  const maxV = Math.max(...present, ...late, ...absent, 1) + 2;
  const h = 130;
  const days = data.map(d => {
    const date = new Date(d.date + "T00:00:00");
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  });

  const yTicks = [1, 0.67, 0.33, 0];

  return (
    <div style={{ position: "relative", height: h + 36, paddingLeft: 32 }}>
      {yTicks.map(t => (
        <div key={t} style={{
          position: "absolute", left: 0, right: 0, bottom: 32 + t * h,
          borderTop: t === 0 ? "1.5px solid #EEE4E4" : "1px dashed #F0EAEA",
        }} />
      ))}
      {yTicks.map(t => (
        <div key={`lbl-${t}`} style={{
          position: "absolute", left: 0, bottom: 32 + t * h - 6,
          fontSize: 9, color: "#bbb", width: 28, textAlign: "right",
        }}>
          {Math.round(maxV * t)}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: h + 28, paddingBottom: 28, marginLeft: 0 }}>
        {days.map((day, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: h }}>
              <div title={`Present: ${present[i]}`} style={{ width: 10, background: BRAND, borderRadius: "3px 3px 0 0", height: Math.max((present[i] / maxV) * h, present[i] > 0 ? 4 : 0), opacity: 0.85 }} />
              <div title={`Late: ${late[i]}`} style={{ width: 10, background: ROSE, borderRadius: "3px 3px 0 0", height: Math.max((late[i] / maxV) * h, late[i] > 0 ? 4 : 0), opacity: 0.85 }} />
              <div title={`Absent: ${absent[i]}`} style={{ width: 10, background: AMBER, borderRadius: "3px 3px 0 0", height: Math.max((absent[i] / maxV) * h, absent[i] > 0 ? 4 : 0), opacity: 0.85 }} />
            </div>
            <div style={{ fontSize: 10, color: "#bbb", marginTop: 7, fontWeight: 500 }}>{day}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayrollBarChart({ data }: { data: Array<{ month: string; gross: number; net: number; deductions: number }> }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No payroll data available.</p>;
  }

  const gross = data.map(d => d.gross);
  const net = data.map(d => d.net);
  const deduct = data.map(d => d.deductions);
  const months = data.map(d => d.month);
  const maxV = Math.max(...gross, ...net, ...deduct, 1);
  const h = 130;

  const formatPeso = (v: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

  const yTicks = [1, 0.67, 0.33, 0];

  return (
    <div style={{ position: "relative", height: h + 36, paddingLeft: 40 }}>
      {yTicks.map(t => (
        <div key={t} style={{
          position: "absolute", left: 0, right: 0, bottom: 32 + t * h,
          borderTop: t === 0 ? "1.5px solid #EEE4E4" : "1px dashed #F0EAEA",
        }} />
      ))}
      {yTicks.map(t => (
        <div key={`lbl-${t}`} style={{
          position: "absolute", left: 0, bottom: 32 + t * h - 6,
          fontSize: 9, color: "#bbb", width: 36, textAlign: "right",
        }}>
          {t === 0 ? "0" : formatPeso(maxV * t)}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: h + 28, paddingBottom: 28 }}>
        {months.map((month, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: h }}>
              <div title={`Gross Pay: ${formatPeso(gross[i])}`} style={{ width: 10, background: BRAND, borderRadius: "3px 3px 0 0", height: Math.max((gross[i] / maxV) * h, gross[i] > 0 ? 4 : 0), opacity: 0.85 }} />
              <div title={`Net Pay: ${formatPeso(net[i])}`} style={{ width: 10, background: GREEN, borderRadius: "3px 3px 0 0", height: Math.max((net[i] / maxV) * h, net[i] > 0 ? 4 : 0), opacity: 0.85 }} />
              <div title={`Deductions: ${formatPeso(deduct[i])}`} style={{ width: 10, background: AMBER, borderRadius: "3px 3px 0 0", height: Math.max((deduct[i] / maxV) * h, deduct[i] > 0 ? 4 : 0), opacity: 0.85 }} />
            </div>
            <div style={{ fontSize: 10, color: "#bbb", marginTop: 7, fontWeight: 500 }}>{month}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
