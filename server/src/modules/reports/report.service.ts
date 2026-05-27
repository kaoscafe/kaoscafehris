import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import type {
  DateRangeQuery,
  HeadcountQuery,
} from "./report.schema.js";

function dateOnly(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

/** Default to the current calendar month when no range is supplied. */
function resolveRange(range: DateRangeQuery): { from: Date; to: Date } {
  if (range.periodStart && range.periodEnd) {
    return { from: dateOnly(range.periodStart), to: dateOnly(range.periodEnd) };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  );
  return {
    from: range.periodStart ? dateOnly(range.periodStart) : start,
    to: range.periodEnd ? dateOnly(range.periodEnd) : end,
  };
}

function toNumber(v: Prisma.Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : v.toNumber();
}

// ---------------------------------------------------------------------------
// Attendance summary
// ---------------------------------------------------------------------------

export interface AttendanceReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  present: number;
  late: number;
  absent: number;
  halfDay: number;
  totalHoursWorked: number;
  totalOvertimeHours: number;
  totalLateMinutes: number;
}

export interface AttendanceReportBranchRow {
  branchId: string;
  branchName: string;
  totalRecords: number;
  present: number;
  late: number;
  absent: number;
  halfDay: number;
  totalHoursWorked: number;
  totalOvertimeHours: number;
  totalLateMinutes: number;
}

export interface AttendanceReport {
  range: { from: string; to: string };
  totals: {
    totalRecords: number;
    present: number;
    late: number;
    absent: number;
    halfDay: number;
    totalHoursWorked: number;
    totalOvertimeHours: number;
    totalLateMinutes: number;
  };
  byBranch: AttendanceReportBranchRow[];
  byEmployee: AttendanceReportRow[];
}

export async function attendanceSummary(
  query: DateRangeQuery
): Promise<AttendanceReport> {
  const { from, to } = resolveRange(query);

  const where: Prisma.AttendanceWhereInput = {
    date: { gte: from, lte: to },
    ...(query.branchId ? { branchId: query.branchId } : {}),
  };

const records = await prisma.attendance.findMany({
  where,
  select: {
    date: true,
    status: true,
    hoursWorked: true,
    overtimeHours: true,
    lateMinutes: true,
    employee: {
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
      },
    },
    branch: { select: { id: true, name: true } },
  },
});

const irishRows = records.filter(
  (r: (typeof records)[number]) => r.employee.employeeId === "KAOS-2025-006"
);

if (irishRows.length > 0) {
  console.log(
    "[reports][attendance][irish]",
    irishRows.map((r: (typeof irishRows)[number]) => ({
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      lateMinutes: r.lateMinutes ?? 0,
      hoursWorked: toNumber(r.hoursWorked),
      overtimeHours: toNumber(r.overtimeHours),
    }))
  );
}

  const empMap = new Map<string, AttendanceReportRow>();
  const branchMap = new Map<string, AttendanceReportBranchRow>();
  const totals = {
    totalRecords: records.length,
    present: 0,
    late: 0,
    absent: 0,
    halfDay: 0,
    totalHoursWorked: 0,
    totalOvertimeHours: 0,
    totalLateMinutes: 0,
  };

  for (const r of records) {
    const hours = toNumber(r.hoursWorked);
    const ot = toNumber(r.overtimeHours);
    const late = r.status === "LATE" ? (r.lateMinutes ?? 0) : 0;

    const status = r.status;
    if (status === "PRESENT") totals.present++;
    else if (status === "LATE") totals.late++;
    else if (status === "ABSENT") totals.absent++;
    else if (status === "HALF_DAY") totals.halfDay++;

    totals.totalHoursWorked += hours;
    totals.totalOvertimeHours += ot;
    totals.totalLateMinutes += late;

    // Per-employee
    const empKey = r.employee.id;
    let emp = empMap.get(empKey);
    if (!emp) {
      emp = {
        employeeId: r.employee.id,
        employeeCode: r.employee.employeeId,
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
        branchId: r.branch.id,
        branchName: r.branch.name,
        present: 0,
        late: 0,
        absent: 0,
        halfDay: 0,
        totalHoursWorked: 0,
        totalOvertimeHours: 0,
        totalLateMinutes: 0,
      };
      empMap.set(empKey, emp);
    }
    if (status === "PRESENT") emp.present++;
    else if (status === "LATE") emp.late++;
    else if (status === "ABSENT") emp.absent++;
    else if (status === "HALF_DAY") emp.halfDay++;
    emp.totalHoursWorked += hours;
    emp.totalOvertimeHours += ot;
    emp.totalLateMinutes += late;

    // Per-branch
    const branchKey = r.branch.id;
    let b = branchMap.get(branchKey);
    if (!b) {
      b = {
        branchId: r.branch.id,
        branchName: r.branch.name,
        totalRecords: 0,
        present: 0,
        late: 0,
        absent: 0,
        halfDay: 0,
        totalHoursWorked: 0,
        totalOvertimeHours: 0,
        totalLateMinutes: 0,
      };
      branchMap.set(branchKey, b);
    }
    b.totalRecords++;
    if (status === "PRESENT") b.present++;
    else if (status === "LATE") b.late++;
    else if (status === "ABSENT") b.absent++;
    else if (status === "HALF_DAY") b.halfDay++;
    b.totalHoursWorked += hours;
    b.totalOvertimeHours += ot;
    b.totalLateMinutes += late;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const byBranch = Array.from(branchMap.values())
    .map((b) => ({
      ...b,
      totalHoursWorked: round2(b.totalHoursWorked),
      totalOvertimeHours: round2(b.totalOvertimeHours),
    }))
    .sort((a, b) => b.totalRecords - a.totalRecords);
  const byEmployee = Array.from(empMap.values())
    .map((e) => ({
      ...e,
      totalHoursWorked: round2(e.totalHoursWorked),
      totalOvertimeHours: round2(e.totalOvertimeHours),
    }))
    .sort(
      (a, b) =>
        b.present + b.late - (a.present + a.late) ||
        b.totalLateMinutes - a.totalLateMinutes
    );

  return {
    range: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    totals: {
      ...totals,
      totalHoursWorked: round2(totals.totalHoursWorked),
      totalOvertimeHours: round2(totals.totalOvertimeHours),
    },
    byBranch,
    byEmployee,
  };
}

// ---------------------------------------------------------------------------
// Payroll summary
// ---------------------------------------------------------------------------

export interface PayrollReportRunRow {
  runId: string;
  branchId: string;
  branchName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  payslipCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
}

export interface PayrollReportBranchRow {
  branchId: string;
  branchName: string;
  runCount: number;
  payslipCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
}

export interface PayrollEmployeeRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  basicPay: number;
  lateDeductions: number;
  actualRegularPay: number;
  netPay: number;
}

export interface PayrollReport {
  range: { from: string; to: string };
  totals: {
    runCount: number;
    payslipCount: number;
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
  };
  byBranch: PayrollReportBranchRow[];
  runs: PayrollReportRunRow[];
  byEmployee: PayrollEmployeeRow[];
}

export async function payrollSummary(
  query: DateRangeQuery
): Promise<PayrollReport> {
  const { from, to } = resolveRange(query);

  const where: Prisma.PayrollRunWhereInput = {
    // Any run whose period overlaps the requested window
    periodStart: { lte: to },
    periodEnd: { gte: from },
    ...(query.branchId ? { branchId: query.branchId } : {}),
  };

  const runs = await prisma.payrollRun.findMany({
    where,
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      branch: { select: { id: true, name: true } },
      payslips: {
        select: {
          grossPay: true,
          totalDeductions: true,
          netPay: true,
          basicPay: true,
          lateDeductions: true,
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              branch: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ periodStart: "desc" }, { branch: { name: "asc" } }],
  });

  const branchMap = new Map<string, PayrollReportBranchRow>();
  const employeeMap = new Map<string, PayrollEmployeeRow>();
  const totals = {
    runCount: runs.length,
    payslipCount: 0,
    totalGross: 0,
    totalDeductions: 0,
    totalNet: 0,
  };

  const runRows: PayrollReportRunRow[] = [];

  for (const r of runs) {
    const payslipCount = r.payslips.length;
    let gross = 0;
    let ded = 0;
    let net = 0;
    for (const p of r.payslips) {
      gross += toNumber(p.grossPay);
      ded += toNumber(p.totalDeductions);
      net += toNumber(p.netPay);

      const emp = p.employee;
      let er = employeeMap.get(emp.id);
      if (!er) {
        er = {
          employeeId: emp.id,
          employeeCode: emp.employeeId,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          branchId: emp.branch.id,
          branchName: emp.branch.name,
          basicPay: 0,
          lateDeductions: 0,
          actualRegularPay: 0,
          netPay: 0,
        };
        employeeMap.set(emp.id, er);
      }
      er.basicPay += toNumber(p.basicPay);
      er.lateDeductions += toNumber(p.lateDeductions);
      er.netPay += toNumber(p.netPay);
    }

    totals.payslipCount += payslipCount;
    totals.totalGross += gross;
    totals.totalDeductions += ded;
    totals.totalNet += net;

    runRows.push({
      runId: r.id,
      branchId: r.branch.id,
      branchName: r.branch.name,
      periodStart: r.periodStart.toISOString().slice(0, 10),
      periodEnd: r.periodEnd.toISOString().slice(0, 10),
      status: r.status,
      payslipCount,
      totalGross: round2(gross),
      totalDeductions: round2(ded),
      totalNet: round2(net),
    });

    let b = branchMap.get(r.branch.id);
    if (!b) {
      b = {
        branchId: r.branch.id,
        branchName: r.branch.name,
        runCount: 0,
        payslipCount: 0,
        totalGross: 0,
        totalDeductions: 0,
        totalNet: 0,
      };
      branchMap.set(r.branch.id, b);
    }
    b.runCount++;
    b.payslipCount += payslipCount;
    b.totalGross += gross;
    b.totalDeductions += ded;
    b.totalNet += net;
  }

  const byBranch = Array.from(branchMap.values())
    .map((b) => ({
      ...b,
      totalGross: round2(b.totalGross),
      totalDeductions: round2(b.totalDeductions),
      totalNet: round2(b.totalNet),
    }))
    .sort((a, b) => b.totalNet - a.totalNet);

  const byEmployee = Array.from(employeeMap.values())
    .map((e) => ({
      ...e,
      basicPay: round2(e.basicPay),
      lateDeductions: round2(e.lateDeductions),
      actualRegularPay: round2(e.basicPay - e.lateDeductions),
      netPay: round2(e.netPay),
    }))
    .sort((a, b) => b.netPay - a.netPay);

  return {
    range: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    totals: {
      ...totals,
      totalGross: round2(totals.totalGross),
      totalDeductions: round2(totals.totalDeductions),
      totalNet: round2(totals.totalNet),
    },
    byBranch,
    runs: runRows,
    byEmployee,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Headcount
// ---------------------------------------------------------------------------

export interface HeadcountBranchRow {
  branchId: string;
  branchName: string;
  fullTime: number;
  partTime: number;
  trainee: number;
  reserved: number;
  terminated: number;
  total: number;
}

export interface HeadcountPositionRow {
  position: string;
  count: number;
}

export interface HeadcountReport {
  totals: {
    fullTime: number;
    partTime: number;
    trainee: number;
    reserved: number;
    terminated: number;
    total: number;
  };
  byBranch: HeadcountBranchRow[];
  byPosition: HeadcountPositionRow[];
}

export async function headcountSummary(
  query: HeadcountQuery
): Promise<HeadcountReport> {
  const where: Prisma.EmployeeWhereInput = query.branchId
    ? { branchId: query.branchId }
    : {};

  const employees = await prisma.employee.findMany({
    where,
    select: {
      position: true,
      employmentStatus: true,
      branch: { select: { id: true, name: true } },
    },
  });

  const branchMap = new Map<string, HeadcountBranchRow>();
  const positionMap = new Map<string, number>();
  const totals = {
    fullTime: 0,
    partTime: 0,
    trainee: 0,
    reserved: 0,
    terminated: 0,
    total: employees.length,
  };

  for (const e of employees) {
    switch (e.employmentStatus) {
      case "FULL_TIME":
        totals.fullTime++;
        break;
      case "PART_TIME":
        totals.partTime++;
        break;
      case "TRAINEE":
        totals.trainee++;
        break;
      case "RESERVED":
        totals.reserved++;
        break;
      case "TERMINATED":
        totals.terminated++;
        break;
    }

    let b = branchMap.get(e.branch.id);
    if (!b) {
      b = {
        branchId: e.branch.id,
        branchName: e.branch.name,
        fullTime: 0,
        partTime: 0,
        trainee: 0,
        reserved: 0,
        terminated: 0,
        total: 0,
      };
      branchMap.set(e.branch.id, b);
    }
    b.total++;
    switch (e.employmentStatus) {
      case "FULL_TIME":
        b.fullTime++;
        break;
      case "PART_TIME":
        b.partTime++;
        break;
      case "TRAINEE":
        b.trainee++;
        break;
      case "RESERVED":
        b.reserved++;
        break;
      case "TERMINATED":
        b.terminated++;
        break;
    }

    positionMap.set(e.position, (positionMap.get(e.position) ?? 0) + 1);
  }

  const byBranch = Array.from(branchMap.values()).sort(
    (a, b) => b.total - a.total
  );
  const byPosition = Array.from(positionMap.entries())
    .map(([position, count]) => ({ position, count }))
    .sort((a, b) => b.count - a.count);

  return { totals, byBranch, byPosition };
}
