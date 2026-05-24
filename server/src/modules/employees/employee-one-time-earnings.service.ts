import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import type { EarningType } from "@prisma/client";

const ALLOWED_TYPES: EarningType[] = ["BONUS", "ALLOWANCE", "OTHER"];

export async function listEmployeeOneTimeEarnings(employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new AppError(404, "Employee not found");

  return prisma.employeeOneTimeEarning.findMany({
    where: { employeeId },
    orderBy: { createdAt: "desc" },
  });
}

export async function addEmployeeOneTimeEarning(
  employeeId: string,
  input: { type: EarningType; label: string; amount: number; effectiveDate: string }
) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new AppError(404, "Employee not found");

  if (!ALLOWED_TYPES.includes(input.type)) {
    throw new AppError(400, "Earning type must be BONUS, ALLOWANCE, or OTHER");
  }
  if (!input.label?.trim()) throw new AppError(400, "Label is required");
  if (typeof input.amount !== "number" || input.amount < 0) {
    throw new AppError(400, "Amount must be a non-negative number");
  }
  if (!input.effectiveDate) throw new AppError(400, "Credit date is required");

  return prisma.employeeOneTimeEarning.create({
    data: {
      employeeId,
      type: input.type,
      label: input.label.trim(),
      amount: input.amount,
      effectiveDate: new Date(input.effectiveDate),
    },
  });
}

export async function updateEmployeeOneTimeEarning(
  employeeId: string,
  oteId: string,
  input: { label?: string; amount?: number; effectiveDate?: string }
) {
  const ote = await prisma.employeeOneTimeEarning.findFirst({
    where: { id: oteId, employeeId },
  });
  if (!ote) throw new AppError(404, "One-time earning not found");
  if (ote.payrollRunId) {
    throw new AppError(409, "Cannot modify a one-time earning that has already been included in a payroll run");
  }

  return prisma.employeeOneTimeEarning.update({
    where: { id: oteId },
    data: {
      ...(input.label !== undefined && { label: input.label.trim() }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.effectiveDate !== undefined && { effectiveDate: new Date(input.effectiveDate) }),
    },
  });
}

export async function removeEmployeeOneTimeEarning(employeeId: string, oteId: string) {
  const ote = await prisma.employeeOneTimeEarning.findFirst({
    where: { id: oteId, employeeId },
  });
  if (!ote) throw new AppError(404, "One-time earning not found");
  if (ote.payrollRunId) {
    throw new AppError(409, "Cannot remove a one-time earning that has already been included in a payroll run");
  }

  await prisma.employeeOneTimeEarning.delete({ where: { id: oteId } });
}
