import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import { logAudit } from "../../lib/audit.js";
import type {
  CreateBranchInput,
  UpdateBranchInput,
  ListBranchQuery,
} from "./branch.schema.js";

const branchWithCounts = {
  _count: {
    select: { employees: true },
  },
  manager: { select: { id: true, firstName: true, lastName: true } },
} as const;

// The assigned manager must be a Branch Manager account — it decides which
// branches' employees that manager may add and edit.
async function assertBranchManager(managerId: string | null | undefined) {
  if (!managerId) return;
  const manager = await prisma.employee.findUnique({
    where: { id: managerId },
    select: { user: { select: { role: true } } },
  });
  if (!manager || manager.user.role !== "MANAGER") {
    throw new AppError(400, "The selected branch manager must have the Branch Manager role");
  }
}

export async function listBranches(query: ListBranchQuery) {
  const where: Prisma.BranchWhereInput = {};
  if (typeof query.isActive === "boolean") where.isActive = query.isActive;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { city: { contains: query.search, mode: "insensitive" } },
      { address: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const branches = await prisma.branch.findMany({
    where,
    include: branchWithCounts,
    orderBy: [{ createdAt: "desc" }, { isActive: "desc" }],
  });

  return branches;
}

export async function getBranchById(id: string) {
  const branch = await prisma.branch.findUnique({
    where: { id },
    include: branchWithCounts,
  });
  if (!branch) throw new AppError(404, "Branch not found");
  return branch;
}

export async function createBranch(input: CreateBranchInput) {
  await assertBranchManager(input.managerId);
  const branch = await prisma.branch.create({
    data: {
      name: input.name,
      address: input.address,
      city: input.city,
      phone: input.phone,
      // A linked manager replaces the legacy free-text name.
      branchManager: input.managerId ? null : input.branchManager,
      managerId: input.managerId,
      operatingHours: input.operatingHours,
      isActive: input.isActive ?? true,
    },
    include: branchWithCounts,
  });
  await logAudit({
    action: "CREATE",
    tableName: "branches",
    recordId: branch.id,
    newValues: branch,
  });
  return branch;
}

export async function updateBranch(id: string, input: UpdateBranchInput) {
  const before = await prisma.branch.findUnique({ where: { id } });
  if (!before) throw new AppError(404, "Branch not found");
  await assertBranchManager(input.managerId);
  const branch = await prisma.branch.update({
    where: { id },
    // A linked manager replaces the legacy free-text name.
    data: input.managerId ? { ...input, branchManager: null } : input,
    include: branchWithCounts,
  });
  await logAudit({
    action: "UPDATE",
    tableName: "branches",
    recordId: id,
    oldValues: before,
    newValues: branch,
  });
  return branch;
}

export async function deactivateBranch(id: string) {
  const before = await prisma.branch.findUnique({ where: { id } });
  if (!before) throw new AppError(404, "Branch not found");
  const branch = await prisma.branch.update({
    where: { id },
    data: { isActive: false },
    include: branchWithCounts,
  });
  await logAudit({
    action: "UPDATE",
    tableName: "branches",
    recordId: id,
    oldValues: before,
    newValues: branch,
  });
  return branch;
}
