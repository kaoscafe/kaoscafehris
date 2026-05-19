import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { extractErrorMessage } from "@/lib/api";
import { COMPANY_TZ } from "@/lib/timezone";
import {
  formatLocalTime,
  getMyAttendance,
  type PortalAttendance,
} from "./portal.api";

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function firstOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfMonth(d: Date): string {
  return localIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function statusBadge(status: PortalAttendance["status"]) {
  switch (status) {
    case "PRESENT":
      return <Badge variant="success">Present</Badge>;
    case "LATE":
      return <Badge variant="warn">Late</Badge>;
    case "ABSENT":
      return <Badge variant="destructive">Absent</Badge>;
    case "ON_LEAVE":
      return <Badge variant="muted">On Leave</Badge>;
    case "HALF_DAY":
      return <Badge variant="muted">Half day</Badge>;
  }
}

export default function MyAttendancePage() {
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState<string>(firstOfMonth(today));
  const [endDate, setEndDate] = useState<string>(lastOfMonth(today));

  const query = useQuery({
    queryKey: ["portal-attendance", startDate, endDate],
    queryFn: () => getMyAttendance({ startDate, endDate }),
  });

  const tz = COMPANY_TZ;

  const totals = useMemo(() => {
    const list = query.data ?? [];
    let hours = 0;
    let ot = 0;
    let late = 0;
    for (const r of list) {
      hours += Number(r.hoursWorked ?? 0);
      ot += Number(r.overtimeHours ?? 0);
      late += r.lateMinutes ?? 0;
    }
    return { hours, ot, late, count: list.length };
  }, [query.data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My attendance</h1>
        <p className="text-sm text-muted-foreground">
          Your clock-in and clock-out history.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="f-start">From</Label>
          <Input
            id="f-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-end">To</Label>
          <Input
            id="f-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Records
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {totals.count}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Hours worked
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {totals.hours.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Overtime hours
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {totals.ot.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Late minutes
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-destructive">
            {totals.late}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Clock in</TableHead>
              <TableHead>Clock out</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">OT</TableHead>
              <TableHead className="text-right">Late</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {query.isError && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-destructive"
                >
                  {extractErrorMessage(query.error, "Failed to load attendance")}
                </TableCell>
              </TableRow>
            )}
            {query.data && query.data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-muted-foreground"
                >
                  No attendance records for this range.
                </TableCell>
              </TableRow>
            )}
            {query.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {r.date.slice(0, 10)}
                </TableCell>
                <TableCell>{r.branch.name}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell className="tabular-nums">
                  {formatLocalTime(r.clockIn, tz)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {r.clockOut ? formatLocalTime(r.clockOut, tz) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.hoursWorked ? Number(r.hoursWorked).toFixed(2) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.overtimeHours ? Number(r.overtimeHours).toFixed(2) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  {r.lateMinutes ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
