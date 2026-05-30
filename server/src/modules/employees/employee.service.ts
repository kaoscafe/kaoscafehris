import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import prisma from "../../config/db.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import { logAudit } from "../../lib/audit.js";
import { sendMail } from "../../lib/email.js";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  ListEmployeeQuery,
} from "./employee.schema.js";

function stripPassword<T extends { password?: string }>(
  v: T | null | undefined
): Omit<T, "password"> | null {
  if (!v) return null;
  const { password: _pw, ...rest } = v;
  return rest;
}

const employeeInclude = {
  branch: { select: { id: true, name: true, city: true } },
  user: { select: { id: true, email: true, role: true, isActive: true, lastLogin: true } },
} as const;

const employeeListInclude = {
  ...employeeInclude,
  documents: {
    select: {
      id: true,
      name: true,
      originalName: true,
      filename: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
    },
  },
} as const;

const LOGO = `<img src="https://www.xn--kaoscaf-hya.com/kaos-logo.svg" alt="KAOS Café" style="height:36px;width:auto;display:block;margin-bottom:12px;filter:brightness(0) invert(1)" />`;

type WelcomeEmailEmployee = {
  firstName: string;
  lastName: string;
  employeeId: string;
  position: string;
  employmentStatus: string;
  dateHired: Date;
  branch?: { name: string } | null;
  user?: { email: string; role: string } | null;
};

async function sendNewEmployeeWelcomeEmail(employee: WelcomeEmailEmployee, password: string) {
  const recipientEmail = employee.user?.email;
  if (!recipientEmail) return;

  const employeeName = `${employee.firstName} ${employee.lastName}`;
  const branchName = employee.branch?.name ?? "Unassigned";
  const hireDate = new Date(employee.dateHired).toISOString().slice(0, 10);
  const role = employee.user?.role ?? "EMPLOYEE";

  await sendMail({
    to: recipientEmail,
    subject: "Welcome to KAOS - Your Employee Portal is Now Ready!",
    html: `
      <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#8C1515,#811C12);padding:24px 28px;border-radius:12px 12px 0 0">
          ${LOGO}
          <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Welcome to KAOS Employee Portal</h2>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Your portal access has been activated</p>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
          <p style="margin:0 0 8px;font-size:14px;color:#374151">Hi ${employee.firstName},</p>
          <p style="margin:0 0 20px;font-size:14px;color:#374151">We're pleased to inform you that the KAOS Employee Portal is now live. Through this portal, you can conveniently:</p>
          <ul style="margin:0 0 20px;padding-left:20px;color:#374151;font-size:14px">
            <li>View your work schedule</li>
            <li>File leave request</li>
            <li>Check your payslips</li>
            <li>Monitor your attendance</li>
          </ul>
          <p style="margin:0 0 20px;font-size:14px;color:#374151">Access the portal here: <a href="https://www.xn--kaoscaf-hya.com/login" style="color:#8C1515;font-weight:700">https://www.xn--kaoscaf-hya.com/login</a></p>

          <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:11px 16px;color:#6b7280;font-weight:500;width:150px;background:#f8fafc">Employee Name</td>
              <td style="padding:11px 16px;color:#111827;font-weight:600">${employeeName}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc">Employee ID</td>
              <td style="padding:11px 16px;color:#111827">${employee.employeeId}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc">Position</td>
              <td style="padding:11px 16px;color:#111827">${employee.position}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc">Employment Status</td>
              <td style="padding:11px 16px;color:#111827">${employee.employmentStatus}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc">Date Hired</td>
              <td style="padding:11px 16px;color:#111827">${hireDate}</td>
            </tr>
          </table>

          <div style="margin-top:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px">
            <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827">Temporary Login Credentials</p>
            <p style="margin:0 0 6px;font-size:14px;color:#374151"><strong>ID NUMBER:</strong> ${employee.employeeId}</p>
            <p style="margin:0 0 6px;font-size:14px;color:#374151"><strong>Password:</strong> ${password}</p>
            <p style="margin:10px 0 0;font-size:12px;color:#6b7280">For security, please change your password after your first login.</p>
          </div>
        </div>
      </div>
    `,
  }).catch(console.error);
}

export async function listEmployees(query: ListEmployeeQuery) {
  const where: Prisma.EmployeeWhereInput = {};
  if (query.branchId) where.branchId = query.branchId;
  if (query.status) where.employmentStatus = query.status;
  if (query.role) where.user = { role: query.role };
  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search, mode: "insensitive" } },
      { lastName: { contains: query.search, mode: "insensitive" } },
      { employeeId: { contains: query.search, mode: "insensitive" } },
      { position: { contains: query.search, mode: "insensitive" } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  return prisma.employee.findMany({
    where,
    include: employeeListInclude,
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function getEmployeeById(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: employeeInclude,
  });
  if (!employee) throw new AppError(404, "Employee not found");
  return employee;
}

export async function createEmployee(input: CreateEmployeeInput) {
  // Ensure branch exists (nicer error than generic FK failure).
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new AppError(400, "Selected branch does not exist");
  if (!branch.isActive) throw new AppError(400, "Cannot assign employee to an inactive branch");

  const hashedPassword = await bcrypt.hash(input.password, env.bcryptRounds);

  // Transactional: User + Employee must both succeed or both roll back.
  const employee = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        role: input.role,
        isActive: true,
      },
    });

    return tx.employee.create({
      data: {
        employeeId: input.employeeId,
        userId: user.id,
        branchId: input.branchId,
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        civilStatus: input.civilStatus,
        nationality: input.nationality,
        phone: input.phone,
        address: input.address,
        city: input.city,
        province: input.province,
        zipCode: input.zipCode,
        emergencyName: input.emergencyName,
        emergencyPhone: input.emergencyPhone,
        emergencyRelation: input.emergencyRelation,
        position: input.position,
        employmentStatus: input.employmentStatus,
        dateHired: input.dateHired,
        payType: input.payType,
        basicSalary: input.basicSalary,
        hourlyRate: input.hourlyRate,
        sssNumber: input.sssNumber,
        philhealthNumber: input.philhealthNumber,
        pagibigNumber: input.pagibigNumber,
        tinNumber: input.tinNumber,
      },
      include: employeeInclude,
    });
  });

  await logAudit({
    action: "CREATE",
    tableName: "employees",
    recordId: employee.id,
    newValues: employee,
  });

  void sendNewEmployeeWelcomeEmail(
    {
      firstName: employee.firstName,
      lastName: employee.lastName,
      employeeId: employee.employeeId,
      position: employee.position,
      employmentStatus: employee.employmentStatus,
      dateHired: employee.dateHired,
      branch: employee.branch,
      user: employee.user,
    },
    input.password
  ).catch((error) => {
    console.error("[employees] Failed to send welcome email", error);
  });

  return employee;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
  const existing = await prisma.employee.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing) throw new AppError(404, "Employee not found");
  const before = { ...existing, user: stripPassword(existing.user) };

  if (input.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
    if (!branch) throw new AppError(400, "Selected branch does not exist");
    if (!branch.isActive) throw new AppError(400, "Cannot reassign to an inactive branch");
  }

  const employeeData: Prisma.EmployeeUpdateInput = {};
  const assign = <K extends keyof UpdateEmployeeInput>(key: K) => {
    if (input[key] !== undefined) {
      (employeeData as Record<string, unknown>)[key as string] = input[key];
    }
  };
  (
    [
      "employeeId",
      "firstName",
      "lastName",
      "middleName",
      "dateOfBirth",
      "gender",
      "civilStatus",
      "nationality",
      "phone",
      "address",
      "city",
      "province",
      "zipCode",
      "emergencyName",
      "emergencyPhone",
      "emergencyRelation",
      "position",
      "employmentStatus",
      "dateHired",
      "payType",
      "basicSalary",
      "hourlyRate",
      "sssNumber",
      "philhealthNumber",
      "pagibigNumber",
      "tinNumber",
    ] as const
  ).forEach(assign);
  if (input.branchId) {
    employeeData.branch = { connect: { id: input.branchId } };
  }

  const userData: Prisma.UserUpdateInput = {};
  if (input.email !== undefined) userData.email = input.email;
  if (input.role !== undefined) userData.role = input.role;
  if (input.isActive !== undefined) userData.isActive = input.isActive;
  if (input.password !== undefined) {
    userData.password = await bcrypt.hash(input.password, env.bcryptRounds);
  }
  const touchUser = Object.keys(userData).length > 0;

  const updated = await prisma.$transaction(async (tx) => {
    if (touchUser) {
      await tx.user.update({ where: { id: existing.userId }, data: userData });
    }
    return tx.employee.update({
      where: { id },
      data: employeeData,
      include: employeeInclude,
    });
  });

  await logAudit({
    action: "UPDATE",
    tableName: "employees",
    recordId: id,
    oldValues: before,
    newValues: updated,
  });
  return updated;
}

// --- CSV import -----------------------------------------------------------

export interface ImportResult {
  created: number;
  skipped: number;
  failed: Array<{ row: number; reason: string }>;
}

function parseCsvRow(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

/**
 * Expected CSV columns (header row required):
 * employeeId, firstName, lastName, email, password, role, branchId,
 * position, dateHired, basicSalary, employmentStatus
 */
export async function importEmployees(csvContent: string): Promise<ImportResult> {
  const lines = csvContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new AppError(400, "CSV must contain a header row and at least one data row");
  }

  const headers = parseCsvRow(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "")
  );
  const required = [
    "employeeid", "firstname", "lastname", "email",
    "branchid", "position", "datehired", "rate",
  ];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) {
    throw new AppError(400, `Missing required CSV columns: ${missing.join(", ")}`);
  }

  const result: ImportResult = { created: 0, skipped: 0, failed: [] };

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    try {
      // Skip the template example row if the user forgot to delete it.
      if (row["employeeid"].toUpperCase().startsWith("EXAMPLE")) {
        result.skipped++;
        continue;
      }

      const existing = await prisma.employee.findUnique({
        where: { employeeId: row["employeeid"] },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      const roleRaw = row["role"]?.toUpperCase();
      const statusRaw = row["employmentstatus"]?.toUpperCase();

      // Accept branch ID (UUID) or branch name (case-insensitive).
      const branchRaw = row["branchid"];
      let resolvedBranchId = branchRaw;
      const branchById = await prisma.branch.findUnique({ where: { id: branchRaw } });
      if (!branchById) {
        const branchByName = await prisma.branch.findFirst({
          where: { name: { equals: branchRaw, mode: "insensitive" } },
        });
        if (!branchByName) throw new AppError(400, `Branch "${branchRaw}" does not exist`);
        resolvedBranchId = branchByName.id;
      }

      const payTypeRaw = row["paytype"]?.toUpperCase();
      const resolvedPayType = (["MONTHLY_FIXED", "HOURLY"].includes(payTypeRaw)
        ? payTypeRaw
        : "MONTHLY_FIXED") as "MONTHLY_FIXED" | "HOURLY";

      const parseRate = (v: string): number => {
        if (!v || v.trim().toUpperCase() === "NULL") return 0;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
      };

      const rateValue = parseRate(row["rate"]);
      await createEmployee({
        employeeId: row["employeeid"],
        firstName: row["firstname"],
        lastName: row["lastname"],
        middleName: row["middlename"] || undefined,
        email: row["email"],
        password: row["password"] || "ChangeMe@1234",
        role: (["ADMIN", "MANAGER", "EMPLOYEE"].includes(roleRaw)
          ? roleRaw
          : "EMPLOYEE") as "ADMIN" | "MANAGER" | "EMPLOYEE",
        branchId: resolvedBranchId,
        position: row["position"],
        dateHired: new Date(row["datehired"]),
        payType: resolvedPayType,
        basicSalary: resolvedPayType === "MONTHLY_FIXED" ? rateValue : 0,
        hourlyRate: resolvedPayType === "HOURLY" ? rateValue : undefined,
        employmentStatus: (["TRAINEE", "FULL_TIME", "PART_TIME", "RESERVED"].includes(statusRaw)
          ? statusRaw
          : "FULL_TIME") as "TRAINEE" | "FULL_TIME" | "PART_TIME" | "RESERVED",
        phone: row["phone"] || undefined,
        sssNumber: row["sssnumber"] || undefined,
        philhealthNumber: row["philhealthnumber"] || undefined,
        pagibigNumber: row["pagibignumber"] || undefined,
        tinNumber: row["tinnumber"] || undefined,
      });
      result.created++;
    } catch (err) {
      let reason = "An unexpected error occurred. Please check this row and try again.";
      if (err instanceof AppError) {
        reason = err.message;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          const fields = (err.meta?.target as string[]) ?? [];
          if (fields.includes("email")) reason = "This email address is already in use.";
          else if (fields.includes("employeeId")) reason = "This Employee ID is already taken.";
          else reason = "A duplicate value was found. Please check this row.";
        } else if (err.code === "P2003") {
          reason = "One of the values (e.g. branch) no longer exists. Please verify and try again.";
        }
      } else if (err instanceof Error) {
        reason = err.message;
      }
      result.failed.push({ row: i + 1, reason });
    }
  }

  return result;
}

// --- CSV import preview (dry-run, no writes) ---------------------------------

export interface ImportPreviewRow {
  row: number;
  status: "ready" | "skipped" | "error";
  reason?: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  branch: string;
  position: string;
  role: string;
  employmentStatus: string;
  dateHired: string;
  payType: string;
  rate: string;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  readyCount: number;
  skippedCount: number;
  errorCount: number;
}

export async function previewImportEmployees(csvContent: string): Promise<ImportPreview> {
  const lines = csvContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new AppError(400, "CSV must contain a header row and at least one data row");
  }

  const headers = parseCsvRow(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "")
  );
  const required = [
    "employeeid", "firstname", "lastname", "email",
    "branchid", "position", "datehired", "rate",
  ];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) {
    throw new AppError(400, `Missing required CSV columns: ${missing.join(", ")}`);
  }

  const rows: ImportPreviewRow[] = [];
  let readyCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

    const rowNum = i + 1;
    const employeeId = row["employeeid"] ?? "";
    const firstName = row["firstname"] ?? "";
    const lastName = row["lastname"] ?? "";
    const email = row["email"] ?? "";
    const position = row["position"] ?? "";
    const dateHired = row["datehired"] ?? "";
    const rate = row["rate"] ?? "";
    const roleRaw = (row["role"] ?? "").toUpperCase();
    const statusRaw = (row["employmentstatus"] ?? "").toUpperCase();
    const role = ["ADMIN", "MANAGER", "EMPLOYEE"].includes(roleRaw) ? roleRaw : "EMPLOYEE";
    const employmentStatus = ["TRAINEE", "FULL_TIME", "PART_TIME", "RESERVED"].includes(statusRaw) ? statusRaw : "FULL_TIME";
    const branchRaw = row["branchid"] ?? "";

    const payTypeRaw = (row["paytype"] ?? "").toUpperCase();
    const payType = ["MONTHLY_FIXED", "HOURLY"].includes(payTypeRaw) ? payTypeRaw : "MONTHLY_FIXED";

    const base = { row: rowNum, employeeId, firstName, lastName, email, branch: branchRaw, position, role, employmentStatus, dateHired, payType, rate };

    try {
      if (employeeId.toUpperCase().startsWith("EXAMPLE")) {
        rows.push({ ...base, status: "skipped", reason: "Template example row" });
        skippedCount++;
        continue;
      }

      const existing = await prisma.employee.findUnique({ where: { employeeId } });
      if (existing) {
        rows.push({ ...base, status: "skipped", reason: "Employee ID already exists" });
        skippedCount++;
        continue;
      }

      const branchById = await prisma.branch.findUnique({ where: { id: branchRaw } });
      if (branchById) {
        rows.push({ ...base, branch: branchById.name, status: "ready" });
      } else {
        const branchByName = await prisma.branch.findFirst({
          where: { name: { equals: branchRaw, mode: "insensitive" } },
        });
        if (!branchByName) throw new AppError(400, `Branch "${branchRaw}" does not exist`);
        rows.push({ ...base, branch: branchByName.name, status: "ready" });
      }
      readyCount++;
    } catch (err) {
      let reason = "An unexpected error occurred";
      if (err instanceof AppError) reason = err.message;
      else if (err instanceof Error) reason = err.message;
      rows.push({ ...base, status: "error", reason });
      errorCount++;
    }
  }

  return { rows, readyCount, skippedCount, errorCount };
}

/**
 * Soft delete: sets employment status to TERMINATED and deactivates the user
 * account. We never hard-delete because payroll/attendance history references
 * employees and must remain auditable.
 */
export async function deactivateEmployee(id: string) {
  const existing = await prisma.employee.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing) throw new AppError(404, "Employee not found");
  const before = { ...existing, user: stripPassword(existing.user) };

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.userId },
      data: { isActive: false },
    });
    return tx.employee.update({
      where: { id },
      data: {
        employmentStatus: "TERMINATED",
        dateTerminated: new Date(),
      },
      include: employeeInclude,
    });
  });

  await logAudit({
    action: "UPDATE",
    tableName: "employees",
    recordId: id,
    oldValues: before,
    newValues: updated,
  });
  return updated;
}

export async function deleteEmployee(id: string) {
  const existing = await prisma.employee.findUnique({
    where: { id },
    include: { user: true, documents: true },
  });
  if (!existing) throw new AppError(404, "Employee not found");

  // Prevent hard-delete if there are dependent records that must remain auditable
  const [attendanceCount, leaveCount, payslipCount, overtimeCount, shiftAssignmentCount] = await Promise.all([
    prisma.attendance.count({ where: { employeeId: id } }),
    prisma.leaveRequest.count({ where: { employeeId: id } }),
    prisma.payslip.count({ where: { employeeId: id } }),
    prisma.overtimeRequest.count({ where: { employeeId: id } }),
    prisma.shiftAssignment.count({ where: { employeeId: id } }),
  ]);

  const blockers: string[] = [];
  if (attendanceCount > 0) blockers.push("attendance records");
  if (leaveCount > 0) blockers.push("leave requests");
  if (payslipCount > 0) blockers.push("payslips");
  if (overtimeCount > 0) blockers.push("overtime requests");
  if (shiftAssignmentCount > 0) blockers.push("shift assignments");

  if (blockers.length > 0) {
    throw new AppError(400, `Cannot delete employee with existing ${blockers.join(", ")}`);
  }

  const docFiles = existing.documents.map((d) => d.filename);
  const before = { ...existing, user: stripPassword(existing.user) };

  await prisma.$transaction(async (tx) => {
    await tx.employee.delete({ where: { id } });
    // Remove associated user account (employee.userId is unique)
    await tx.user.delete({ where: { id: existing.userId } });
  });

  await logAudit({ action: "DELETE", tableName: "employees", recordId: id, oldValues: before });

  // Clean up uploaded document files (best-effort)
  const uploadsBase = process.env.UPLOADS_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "uploads");
  const documentsDir = path.join(uploadsBase, "documents");
  for (const f of docFiles) {
    try {
      await fs.unlink(path.join(documentsDir, f));
    } catch {
      // ignore failures to remove files — DB deletion already done
    }
  }
}
