import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";

export async function listEmployeeDeductions(employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new AppError(404, "Employee not found");

  return prisma.employeeDeduction.findMany({
    where: { employeeId },
    include: {
      deduction: { select: { id: true, name: true, type: true, amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function addEmployeeDeduction(
  employeeId: string,
  input: { deductionId: string; amount?: number | null; totalBalance?: number | null }
) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new AppError(404, "Employee not found");

  const deduction = await prisma.deduction.findUnique({ where: { id: input.deductionId } });
  if (!deduction) throw new AppError(404, "Deduction not found");

  // The same deduction may be assigned any number of times: settled ones stay on the
  // record as history, and several may be collected side by side (e.g. two separate
  // uniform issues). Each assignment tracks its own balance and is charged separately.

  return prisma.employeeDeduction.create({
    data: {
      employeeId,
      deductionId: input.deductionId,
      amount: input.amount ?? null,
      totalBalance: input.totalBalance ?? null,
      paidAmount: 0,
    },
    include: {
      deduction: { select: { id: true, name: true, type: true, amount: true } },
    },
  });
}

export async function updateEmployeeDeduction(
  employeeId: string,
  edId: string,
  input: { amount?: number | null; totalBalance?: number | null; paidAmount?: number }
) {
  const ed = await prisma.employeeDeduction.findFirst({ where: { id: edId, employeeId } });
  if (!ed) throw new AppError(404, "Employee deduction not found");

  return prisma.employeeDeduction.update({
    where: { id: edId },
    data: {
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.totalBalance !== undefined && { totalBalance: input.totalBalance }),
      ...(input.paidAmount !== undefined && { paidAmount: input.paidAmount }),
    },
    include: {
      deduction: { select: { id: true, name: true, type: true, amount: true } },
    },
  });
}

export async function removeEmployeeDeduction(employeeId: string, edId: string) {
  const ed = await prisma.employeeDeduction.findFirst({ where: { id: edId, employeeId } });
  if (!ed) throw new AppError(404, "Employee deduction not found");

  await prisma.employeeDeduction.delete({ where: { id: edId } });
}
