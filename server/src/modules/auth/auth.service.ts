import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import prisma from "../../config/db.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import type { AuthPayload } from "../../middleware/auth.js";
import type { LoginInput } from "./auth.schema.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  isActive: boolean;
  employee: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    position: string;
    branchId: string;
    profilePhoto: string | null;
  } | null;
}

const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.k9wXy7VpZK2vV8H5vFq7y7LQYuSS";

const EMPLOYEE_SELECT = {
  id: true,
  employeeId: true,
  firstName: true,
  lastName: true,
  position: true,
  branchId: true,
  profilePhoto: true,
  employmentStatus: true,
} as const;

function signToken(payload: AuthPayload): string {
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.jwtSecret, options);
}

export async function login(input: LoginInput): Promise<{
  token: string;
  user: AuthenticatedUser;
}> {
  // Try employee ID lookup first, fall back to email (for admin accounts).
  let user = null as Awaited<ReturnType<typeof prisma.user.findUnique>> & { employee: { id: string; employeeId: string; firstName: string; lastName: string; position: string; branchId: string; profilePhoto: string | null; employmentStatus: string } | null } | null;

  const emp = await prisma.employee.findUnique({
    where: { employeeId: input.employeeId },
    select: { userId: true },
  });

  if (emp) {
    user = await prisma.user.findUnique({
      where: { id: emp.userId },
      include: { employee: { select: EMPLOYEE_SELECT } },
    }) as typeof user;
  } else {
    user = await prisma.user.findUnique({
      where: { email: input.employeeId },
      include: { employee: { select: EMPLOYEE_SELECT } },
    }) as typeof user;
  }

  // Always run bcrypt compare to avoid timing attacks.
  const hashForCompare = user?.password || DUMMY_HASH;
  const passwordOk = await bcrypt.compare(input.password, hashForCompare);

  if (!user || !passwordOk) {
    throw new AppError(401, "ID does not exist or incorrect password");
  }

  const terminated = user.employee?.employmentStatus === "TERMINATED";
  if (!user.isActive || terminated) {
    throw new AppError(
      403,
      terminated
        ? "Your employment has been terminated. Contact your administrator."
        : "Account has been deactivated. Contact your administrator."
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const token = signToken({ userId: user.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      employee: user.employee,
    },
  };
}

export async function getCurrentUser(userId: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      employee: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          position: true,
          branchId: true,
          profilePhoto: true,
          employmentStatus: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  const terminated = user.employee?.employmentStatus === "TERMINATED";
  if (!user.isActive || terminated) {
    throw new AppError(
      403,
      terminated ? "Your employment has been terminated." : "Account has been deactivated"
    );
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    employee: user.employee
      ? {
          id: user.employee.id,
          employeeId: user.employee.employeeId,
          firstName: user.employee.firstName,
          lastName: user.employee.lastName,
          position: user.employee.position,
          branchId: user.employee.branchId,
          profilePhoto: user.employee.profilePhoto,
        }
      : null,
  };
}
