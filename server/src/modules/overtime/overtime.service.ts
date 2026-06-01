import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import type {
  CreateOvertimeInput,
  UpdateOvertimeInput,
  ReviewOvertimeInput,
  ListOvertimeQuery,
  ApproveShiftOvertimeInput,
  CreateScheduleInput,
  UpdateScheduleInput,
  ListSchedulesQuery,
} from "./overtime.schema.js";

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function computeOtHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

const overtimeInclude = {
  employee: {
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      position: true,
      branchId: true,
      branch: { select: { id: true, name: true } },
    },
  },
} as const;

export async function listRequests(
  query: ListOvertimeQuery,
  scopedEmployeeId?: string,
  scopedBranchId?: string
) {
  const where: Prisma.OvertimeRequestWhereInput = {};
  if (scopedEmployeeId) {
    where.employeeId = scopedEmployeeId;
  } else if (query.employeeId) {
    where.employeeId = query.employeeId;
  }
  if (scopedBranchId) {
    where.employee = { branchId: scopedBranchId };
  }
  if (query.status) where.status = query.status;
  if (query.startDate || query.endDate) {
    where.date = {};
    if (query.startDate) where.date.gte = dateOnly(query.startDate);
    if (query.endDate) where.date.lte = dateOnly(query.endDate);
  }

  return prisma.overtimeRequest.findMany({
    where,
    include: overtimeInclude,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
}

export async function createRequest(employeeId: string, input: CreateOvertimeInput) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new AppError(404, "Employee not found");

  const otHours = input.otHours ?? (input.startTime && input.endTime ? computeOtHours(input.startTime, input.endTime) : undefined);

  return prisma.overtimeRequest.create({
    data: {
      employeeId,
      shiftId: input.shiftId,
      date: dateOnly(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason,
      otHours,
    },
    include: overtimeInclude,
  });
}

export async function reviewRequest(
  id: string,
  reviewerId: string,
  input: ReviewOvertimeInput
) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id } });
  if (!req) throw new AppError(404, "Overtime request not found");
  if (req.status !== "PENDING") throw new AppError(409, "Request already reviewed");

  return prisma.overtimeRequest.update({
    where: { id },
    data: {
      status: input.status,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes,
    },
    include: overtimeInclude,
  });
}

export async function revertRequest(id: string) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id } });
  if (!req) throw new AppError(404, "Overtime request not found");
  if (req.status !== "APPROVED" && req.status !== "REJECTED") {
    throw new AppError(409, "Only approved or rejected requests can be reverted");
  }

  // Block revert if the overtime date falls within a completed payroll run
  const completedRun = await prisma.payrollRun.findFirst({
    where: {
      status: "COMPLETED",
      periodStart: { lte: new Date(req.date) },
      periodEnd: { gte: new Date(req.date) },
      payslips: { some: { employeeId: req.employeeId } },
    },
    select: { id: true, periodStart: true, periodEnd: true },
  });

  if (completedRun) {
    const start = completedRun.periodStart.toISOString().slice(0, 10);
    const end = completedRun.periodEnd.toISOString().slice(0, 10);
    throw new AppError(
      409,
      `Cannot revert: a completed payroll run (${start} – ${end}) already covers this overtime date.`
    );
  }

  return prisma.overtimeRequest.update({
    where: { id },
    data: { status: "PENDING", reviewedBy: null, reviewedAt: null, reviewNotes: null },
    include: overtimeInclude,
  });
}

export async function updateRequest(id: string, input: UpdateOvertimeInput) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id } });
  if (!req) throw new AppError(404, "Overtime request not found");

  const startTime = input.startTime !== undefined ? input.startTime : req.startTime;
  const endTime = input.endTime !== undefined ? input.endTime : req.endTime;
  const otHours =
    input.otHours !== undefined
      ? input.otHours
      : input.startTime !== undefined || input.endTime !== undefined
        ? (startTime && endTime ? computeOtHours(startTime, endTime) : undefined)
        : req.otHours;

  return prisma.overtimeRequest.update({
    where: { id },
    data: {
      ...(input.date ? { date: dateOnly(input.date) } : {}),
      startTime,
      endTime,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      otHours,
    },
    include: overtimeInclude,
  });
}

// ─── Overtime Schedules (admin/manager pre-assigned) ─────────────────────────

const scheduleInclude = {
  employee: {
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      position: true,
      branch: { select: { id: true, name: true } },
    },
  },
} as const;

export async function listSchedules(query: ListSchedulesQuery, scopedBranchId?: string) {
  const where: Prisma.OvertimeScheduleWhereInput = {};
  if (query.employeeId) where.employeeId = query.employeeId;
  if (scopedBranchId) where.employee = { branchId: scopedBranchId };
  if (query.startDate || query.endDate) {
    where.date = {};
    if (query.startDate) where.date.gte = dateOnly(query.startDate);
    if (query.endDate) where.date.lte = dateOnly(query.endDate);
  }
  return prisma.overtimeSchedule.findMany({
    where,
    include: scheduleInclude,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 500,
  });
}

export async function createSchedule(createdById: string, input: CreateScheduleInput) {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw new AppError(404, "Employee not found");

  const otHours = input.otHours ?? computeOtHours(input.startTime, input.endTime);

  return prisma.overtimeSchedule.create({
    data: {
      employeeId: input.employeeId,
      date: dateOnly(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
      notes: input.notes,
      otHours,
      createdById,
    },
    include: scheduleInclude,
  });
}

export async function updateSchedule(id: string, input: UpdateScheduleInput) {
  const existing = await prisma.overtimeSchedule.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Overtime schedule not found");

  const startTime = input.startTime ?? existing.startTime;
  const endTime = input.endTime ?? existing.endTime;
  const otHours = input.otHours !== undefined ? input.otHours : computeOtHours(startTime, endTime);

  return prisma.overtimeSchedule.update({
    where: { id },
    data: {
      ...(input.date ? { date: dateOnly(input.date) } : {}),
      startTime,
      endTime,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      otHours,
    },
    include: scheduleInclude,
  });
}

export async function deleteSchedule(id: string) {
  const existing = await prisma.overtimeSchedule.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Overtime schedule not found");

  const completedRun = await prisma.payrollRun.findFirst({
    where: {
      status: "COMPLETED",
      periodStart: { lte: new Date(existing.date) },
      periodEnd: { gte: new Date(existing.date) },
      payslips: { some: { employeeId: existing.employeeId } },
    },
    select: { id: true, periodStart: true, periodEnd: true },
  });

  if (completedRun) {
    const start = completedRun.periodStart.toISOString().slice(0, 10);
    const end = completedRun.periodEnd.toISOString().slice(0, 10);
    throw new AppError(
      409,
      `Cannot revert: a completed payroll run (${start} – ${end}) already covers this overtime date.`
    );
  }

  await prisma.overtimeSchedule.delete({ where: { id } });
}

/** Returns attendance records with overtime hours, enriched with ShiftAssignment approval status. */
export async function getAttendanceOvertime(params: {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  branchId?: string;
}) {
  const dateFilter: Prisma.DateTimeFilter = {};
  if (params.startDate) dateFilter.gte = dateOnly(params.startDate);
  if (params.endDate)   dateFilter.lte = dateOnly(params.endDate);

  const records = await prisma.attendance.findMany({
    where: {
      overtimeHours: { gt: 0 },
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      ...(params.employeeId && { employeeId: params.employeeId }),
      ...(params.branchId && { employee: { branchId: params.branchId } }),
    },
    select: {
      id: true,
      date: true,
      overtimeHours: true,
      employeeId: true,
      employee: {
        select: {
          id: true, employeeId: true, firstName: true, lastName: true, position: true, employmentStatus: true,
          branch: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { date: "desc" },
    take: 300,
  });

  if (records.length === 0) return [];

  const employeeIds = [...new Set(records.map((r) => r.employeeId))];
  const dates       = [...new Set(records.map((r) => r.date))];

  const [assignments, approvedRequests] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { employeeId: { in: employeeIds }, shift: { date: { in: dates } } },
      select: { employeeId: true, shiftId: true, overtimeApproved: true, overtimeRejected: true, shift: { select: { date: true } } },
    }),
    prisma.overtimeRequest.findMany({
      where: { employeeId: { in: employeeIds }, date: { in: dates }, status: "APPROVED" },
      select: { employeeId: true, date: true },
    }),
  ]);

  const approvalMap = new Map<string, { overtimeApproved: boolean; overtimeRejected: boolean; shiftId: string }>();
  for (const a of assignments) {
    const key = `${a.employeeId}:${a.shift.date.toISOString().slice(0, 10)}`;
    approvalMap.set(key, { overtimeApproved: a.overtimeApproved, overtimeRejected: a.overtimeRejected, shiftId: a.shiftId });
  }
  const requestApproved = new Set(approvedRequests.map((r) => `${r.employeeId}:${r.date.toISOString().slice(0, 10)}`));

  return records.map((rec) => {
    const dateKey  = rec.date.toISOString().slice(0, 10);
    const key      = `${rec.employeeId}:${dateKey}`;
    const entry    = approvalMap.get(key);
    return {
      id:              rec.id,
      date:            rec.date,
      overtimeHours:   rec.overtimeHours,
      overtimeApproved: (entry?.overtimeApproved ?? false) || requestApproved.has(key),
      overtimeRejected: entry?.overtimeRejected ?? false,
      shiftId:         entry?.shiftId ?? null,
      employee:        rec.employee,
    };
  });
}

/** Manager/admin toggles overtime approval/rejection directly on a ShiftAssignment. */
export async function setShiftOvertimeApproval(
  shiftId: string,
  employeeId: string,
  approverId: string,
  input: ApproveShiftOvertimeInput
) {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { shiftId_employeeId: { shiftId, employeeId } },
  });
  if (!assignment) throw new AppError(404, "Shift assignment not found");

  const data: Prisma.ShiftAssignmentUpdateInput = {};
  if (input.overtimeApproved !== undefined) {
    data.overtimeApproved = input.overtimeApproved;
    data.overtimeRejected = false;
    data.overtimeApprovedBy = input.overtimeApproved ? approverId : null;
  }
  if (input.overtimeRejected !== undefined) {
    data.overtimeRejected = input.overtimeRejected;
    data.overtimeApproved = false;
    data.overtimeApprovedBy = input.overtimeRejected ? approverId : null;
  }

  return prisma.shiftAssignment.update({
    where: { shiftId_employeeId: { shiftId, employeeId } },
    data,
  });
}
