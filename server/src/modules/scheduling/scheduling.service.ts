import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import { logAudit } from "../../lib/audit.js";
import type {
  AssignEmployeesInput,
  AssignEmployeeEntry,
  CreateShiftInput,
  ListShiftsQuery,
  UpdateShiftInput,
} from "./scheduling.schema.js";

const shiftInclude = {
  branch: { select: { id: true, name: true } },
  shiftType: { select: { id: true, name: true } },
  assignments: {
    include: {
      employee: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          position: true,
        },
      },
      assignedBranch: { select: { id: true, name: true } },
    },
  },
} as const;

/**
 * Prisma maps @db.Time to DateTime at the Date 1970-01-01. To store an HH:MM
 * value we build a UTC date at that epoch so the time portion is exactly what
 * the user entered.
 */
function timeToDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

function dateOnly(isoDate: string): Date {
  // Interpret as UTC midnight so no timezone drift.
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export async function listShifts(query: ListShiftsQuery) {
  const where: Prisma.ShiftWhereInput = {};
  if (query.branchIds) {
    const ids = query.branchIds.split(",").filter(Boolean);
    if (ids.length > 0) where.branchId = { in: ids };
  }
  if (query.status) where.status = query.status;
  if (query.startDate || query.endDate) {
    where.date = {};
    if (query.startDate) where.date.gte = dateOnly(query.startDate);
    if (query.endDate) where.date.lte = dateOnly(query.endDate);
  }

  return prisma.shift.findMany({
    where,
    include: shiftInclude,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}

export async function getShiftById(id: string) {
  const shift = await prisma.shift.findUnique({
    where: { id },
    include: shiftInclude,
  });
  if (!shift) throw new AppError(404, "Shift not found");
  return shift;
}

async function ensureEmployeesValid(entries: AssignEmployeeEntry[]) {
  if (entries.length === 0) return;
  const employeeIds = entries.map((e) => e.employeeId);
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, employmentStatus: true },
  });
  if (employees.length !== employeeIds.length) {
    throw new AppError(400, "One or more employees do not exist");
  }
  const terminated = employees.filter((e) => e.employmentStatus === "TERMINATED");
  if (terminated.length > 0) {
    throw new AppError(400, "Cannot assign terminated employees");
  }
}

async function ensureNoShiftTypeConflict(employeeIds: string[], date: string, shiftTypeId: string | null | undefined, excludeShiftId?: string) {
  if (employeeIds.length === 0 || !shiftTypeId) return;
  const targetDate = dateOnly(date);
  const nextDay = new Date(targetDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const conflicts = await prisma.shiftAssignment.findMany({
    where: {
      employeeId: { in: employeeIds },
      shift: {
        date: { gte: targetDate, lt: nextDay },
        shiftTypeId,
        ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
      },
    },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });

  if (conflicts.length > 0) {
    const names = [...new Set(conflicts.map((c) => `${c.employee.firstName} ${c.employee.lastName}`))].join(", ");
    throw new AppError(400, `Employee(s) are already assigned to this shift type on this date: ${names}`);
  }
}

export async function createShift(input: CreateShiftInput) {
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new AppError(400, "Branch not found");
  if (!branch.isActive) throw new AppError(400, "Cannot create shifts for an inactive branch");

  await ensureEmployeesValid(input.employees);
  await ensureNoShiftTypeConflict(input.employees.map((e) => e.employeeId), input.date, input.shiftTypeId);

  let startTime: Date;
  let endTime: Date;

  // If shiftTypeId is provided, fetch times from the shift type
  if (input.shiftTypeId) {
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: input.shiftTypeId },
    });
    if (!shiftType) throw new AppError(400, "Shift type not found");
    startTime = shiftType.startTime;
    endTime = shiftType.endTime;
  } else {
    // Otherwise use provided times
    if (!input.startTime || !input.endTime) {
      throw new AppError(400, "Either provide a shift type or both start and end times");
    }
    startTime = timeToDate(input.startTime);
    endTime = timeToDate(input.endTime);
  }

  const shift = await prisma.shift.create({
    data: {
      branchId: input.branchId,
      shiftTypeId: input.shiftTypeId,
      name: input.name,
      date: dateOnly(input.date),
      startTime,
      endTime,
      status: "PUBLISHED",
      assignments: input.employees.length
        ? {
            create: input.employees.map((e) => ({
              employeeId: e.employeeId,
              assignedBranchId: e.assignedBranchId ?? null,
            })),
          }
        : undefined,
    },
    include: shiftInclude,
  });
  await logAudit({
    action: "CREATE",
    tableName: "shifts",
    recordId: shift.id,
    newValues: shift,
  });
  return shift;
}

export async function updateShift(id: string, input: UpdateShiftInput) {
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Shift not found");

  const data: Prisma.ShiftUpdateInput = {};
  if (input.branchId !== undefined) {
    const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
    if (!branch) throw new AppError(400, "Branch not found");
    if (!branch.isActive) throw new AppError(400, "Cannot assign shift to an inactive branch");
    data.branch = { connect: { id: input.branchId } };
  }
  if (input.name !== undefined) data.name = input.name;
  if (input.date !== undefined) data.date = dateOnly(input.date);
  if (input.startTime !== undefined) data.startTime = timeToDate(input.startTime);
  if (input.endTime !== undefined) data.endTime = timeToDate(input.endTime);
  if (input.status !== undefined) data.status = input.status;

  const updated = await prisma.shift.update({
    where: { id },
    data,
    include: shiftInclude,
  });
  await logAudit({
    action: "UPDATE",
    tableName: "shifts",
    recordId: id,
    oldValues: existing,
    newValues: updated,
  });
  return updated;
}

export async function deleteShift(id: string) {
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Shift not found");
  await prisma.shift.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    tableName: "shifts",
    recordId: id,
    oldValues: existing,
  });
}

export async function assignEmployees(shiftId: string, input: AssignEmployeesInput) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) throw new AppError(404, "Shift not found");

  await ensureEmployeesValid(input.employees);
  await ensureNoShiftTypeConflict(
    input.employees.map((e) => e.employeeId),
    shift.date.toISOString().slice(0, 10),
    shift.shiftTypeId,
    shiftId
  );

  // Idempotent: skip existing assignments, create the rest.
  const result = await prisma.shiftAssignment.createMany({
    data: input.employees.map((e) => ({
      shiftId,
      employeeId: e.employeeId,
      assignedBranchId: e.assignedBranchId ?? null,
    })),
    skipDuplicates: true,
  });

  if (result.count > 0) {
    await logAudit({
      action: "UPDATE",
      tableName: "shift_assignments",
      recordId: shiftId,
      newValues: { shiftId, addedEmployeeIds: input.employees.map((e) => e.employeeId), added: result.count },
    });
  }

  return getShiftById(shiftId);
}

export async function unassignEmployee(shiftId: string, employeeId: string) {
  const existing = await prisma.shiftAssignment.findUnique({
    where: { shiftId_employeeId: { shiftId, employeeId } },
  });
  if (!existing) throw new AppError(404, "Assignment not found");
  await prisma.shiftAssignment.delete({
    where: { shiftId_employeeId: { shiftId, employeeId } },
  });
  await logAudit({
    action: "DELETE",
    tableName: "shift_assignments",
    recordId: existing.id,
    oldValues: existing,
  });
  return getShiftById(shiftId);
}
