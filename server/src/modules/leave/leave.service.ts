import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import { logAudit } from "../../lib/audit.js";
import { sendMail } from "../../lib/email.js";
import type {
  CreateLeaveRequestInput,
  ListLeaveBalancesQuery,
  ListLeaveQuery,
  ReviewLeaveInput,
  UpsertLeaveBalanceInput,
  UpsertBalanceForAllInput,
} from "./leave.schema.js";

const LOGO = `<img src="https://www.kaoscafé.com/kaos-logo.svg" alt="KAOS Café" style="height:36px;width:auto;display:block;margin-bottom:12px;filter:brightness(0) invert(1)" />`;

const LEAVE_LABEL: Record<string, string> = {
  VACATION: "Vacation",
  SICK: "Sick",
  EMERGENCY: "Emergency",
  MATERNITY: "Maternity",
  PATERNITY: "Paternity",
  UNPAID: "Unpaid",
};

const requestInclude = {
  employee: {
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      position: true,
      branchId: true,
    },
  },
} as const;

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export async function listRequests(query: ListLeaveQuery) {
  const where: Prisma.LeaveRequestWhereInput = {};
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.status) where.status = query.status;
  if (query.leaveType) where.leaveType = query.leaveType;
  if (query.startDate || query.endDate) {
    where.startDate = {};
    if (query.startDate) where.startDate.gte = dateOnly(query.startDate);
    if (query.endDate) where.startDate.lte = dateOnly(query.endDate);
  }

  return prisma.leaveRequest.findMany({
    where,
    include: requestInclude,
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });
}

export async function getRequestById(id: string) {
  const row = await prisma.leaveRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
  if (!row) throw new AppError(404, "Leave request not found");
  return row;
}

export async function createRequest(input: CreateLeaveRequestInput) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, employmentStatus: true },
  });
  if (!employee) throw new AppError(404, "Employee not found");
  if (employee.employmentStatus === "TERMINATED") {
    throw new AppError(400, "Terminated employees cannot file leave requests");
  }

  // Block filing if no leave balance has been set for this type/year (except UNPAID)
  if (input.leaveType !== "UNPAID") {
    const year = new Date(input.startDate).getUTCFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId: input.employeeId,
          leaveType: input.leaveType,
          year,
        },
      },
    });
    if (!balance) {
      throw new AppError(
        400,
        `No leave credits have been set for ${LEAVE_LABEL[input.leaveType] ?? input.leaveType} leave. Please contact your administrator.`
      );
    }
    if (Number(balance.remainingDays) <= 0) {
      throw new AppError(400, `You have no remaining ${LEAVE_LABEL[input.leaveType] ?? input.leaveType} leave credits.`);
    }
  }

  const created = await prisma.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      startDate: dateOnly(input.startDate),
      endDate: dateOnly(input.endDate),
      totalDays: input.totalDays,
      reason: input.reason,
    },
    include: requestInclude,
  });
  await logAudit({
    action: "CREATE",
    tableName: "leave_requests",
    recordId: created.id,
    newValues: created,
  });

  // Notify admins/managers
  const [managers, employeeUser] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
      select: { email: true },
    }),
    prisma.user.findFirst({
      where: { employee: { id: input.employeeId } },
      select: { email: true },
    }),
  ]);
  const managerEmails = managers.map((u) => u.email);
  console.log(`[leave] Notifying ${managerEmails.length} admin(s)/manager(s):`, managerEmails);
  if (managerEmails.length > 0) {
    const empName = `${created.employee.firstName} ${created.employee.lastName}`;
    const leaveLabel = LEAVE_LABEL[created.leaveType] ?? created.leaveType;
    const start = created.startDate.toISOString().slice(0, 10);
    const end = created.endDate.toISOString().slice(0, 10);
    sendMail({
      to: managerEmails,
      replyTo: employeeUser?.email,
      subject: `Leave Request — ${empName} (${leaveLabel})`,
      html: `
        <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#8C1515,#811C12);padding:24px 28px;border-radius:12px 12px 0 0">
            ${LOGO}
            <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Leave Request</h2>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Awaiting your review</p>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
            <p style="margin:0 0 20px;font-size:14px;color:#374151">A new leave request has been filed and is awaiting your review.</p>
            <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
              <tr style="border-bottom:1px solid #e2e8f0">
                <td style="padding:11px 16px;color:#6b7280;font-weight:500;width:110px;background:#f8fafc">Employee</td>
                <td style="padding:11px 16px;color:#111827;font-weight:600">${empName}</td>
              </tr>
              <tr style="border-bottom:1px solid #e2e8f0">
                <td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc">Leave Type</td>
                <td style="padding:11px 16px;color:#111827">${leaveLabel}</td>
              </tr>
              <tr${created.reason ? ' style="border-bottom:1px solid #e2e8f0"' : ""}>
                <td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc">Dates</td>
                <td style="padding:11px 16px;color:#111827">${start} &rarr; ${end} <span style="color:#6b7280;font-size:13px">(${created.totalDays} day${Number(created.totalDays) !== 1 ? "s" : ""})</span></td>
              </tr>
              ${created.reason ? `<tr><td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc;vertical-align:top">Reason</td><td style="padding:11px 16px;color:#374151">${created.reason}</td></tr>` : ""}
            </table>
            <div style="margin-top:24px;text-align:center;color:#6b7280;font-size:13px">
              Please go to the portal to view this request.
            </div>
          </div>
        </div>
      `,
    }).catch(console.error);
  }

  return created;
}

/**
 * Approving a leave request deducts from the matching balance (if one exists)
 * for the request's start-date year. UNPAID leave has no balance effect.
 * Runs in a transaction so balance + request stay consistent.
 */
export async function reviewRequest(
  id: string,
  reviewerUserId: string,
  input: ReviewLeaveInput
) {
  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) throw new AppError(404, "Leave request not found");
  if (request.status !== "PENDING") {
    throw new AppError(409, `Request is already ${request.status.toLowerCase()}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.status === "APPROVED" && request.leaveType !== "UNPAID") {
      const year = new Date(request.startDate).getUTCFullYear();
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveType_year: {
            employeeId: request.employeeId,
            leaveType: request.leaveType,
            year,
          },
        },
      });

      if (balance) {
        const remaining = Number(balance.remainingDays);
        const requested = Number(request.totalDays);
        if (requested > remaining) {
          throw new AppError(
            400,
            `Insufficient balance: ${remaining} day(s) remaining, request is for ${requested} day(s)`
          );
        }
        const newUsed = Number(balance.usedDays) + requested;
        const newRemaining = Number(balance.totalDays) - newUsed;
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: newUsed, remainingDays: newRemaining },
        });
      }
      // If no balance row exists, approve without tracking — admin can reconcile
      // later. This keeps the flow unblocked for employees hired mid-year.
    }

    return tx.leaveRequest.update({
      where: { id },
      data: {
        status: input.status,
        reviewedBy: reviewerUserId,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes,
      },
      include: requestInclude,
    });
  });

  await logAudit({
    action: "UPDATE",
    tableName: "leave_requests",
    recordId: id,
    oldValues: request,
    newValues: updated,
  });

  // Notify the employee of the outcome
  const employeeUser = await prisma.user.findFirst({
    where: { employee: { id: updated.employee.id } },
    select: { email: true },
  });
  if (employeeUser) {
    const empName = `${updated.employee.firstName} ${updated.employee.lastName}`;
    const leaveLabel = LEAVE_LABEL[updated.leaveType] ?? updated.leaveType;
    const start = updated.startDate.toISOString().slice(0, 10);
    const end = updated.endDate.toISOString().slice(0, 10);
    const isApproved = input.status === "APPROVED";
    sendMail({
      to: employeeUser.email,
      subject: `Your leave request has been ${isApproved ? "approved" : "rejected"}`,
      html: `
        <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,${isApproved ? "#8C1515,#811C12" : "#280906,#040404"});padding:24px 28px;border-radius:12px 12px 0 0">
            ${LOGO}
            <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Leave ${isApproved ? "Approved" : "Rejected"}</h2>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Your request has been reviewed</p>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
            <p style="margin:0 0 8px;font-size:14px;color:#374151">Hi ${updated.employee.firstName},</p>
            <p style="margin:0 0 20px;font-size:14px;color:#374151">Your leave request has been <strong style="color:${isApproved ? "#166534" : "#991b1b"}">${isApproved ? "approved" : "rejected"}</strong>.</p>
            <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
              <tr style="border-bottom:1px solid #e2e8f0">
                <td style="padding:11px 16px;color:#6b7280;font-weight:500;width:110px;background:#f8fafc">Leave Type</td>
                <td style="padding:11px 16px;color:#111827">${leaveLabel}</td>
              </tr>
              <tr${input.reviewNotes ? ' style="border-bottom:1px solid #e2e8f0"' : ""}>
                <td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc">Dates</td>
                <td style="padding:11px 16px;color:#111827">${start} &rarr; ${end} <span style="color:#6b7280;font-size:13px">(${updated.totalDays} day${Number(updated.totalDays) !== 1 ? "s" : ""})</span></td>
              </tr>
              ${input.reviewNotes ? `<tr><td style="padding:11px 16px;color:#6b7280;font-weight:500;background:#f8fafc;vertical-align:top">Notes</td><td style="padding:11px 16px;color:#374151">${input.reviewNotes}</td></tr>` : ""}
            </table>
          </div>
        </div>
      `,
    }).catch(console.error);
  }

  return updated;
}

export async function cancelRequest(id: string) {
  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) throw new AppError(404, "Leave request not found");
  if (request.status === "CANCELLED") return getRequestById(id);
  if (request.status === "APPROVED") {
    throw new AppError(
      409,
      "Approved requests cannot be cancelled. Contact an admin for reversal."
    );
  }
  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: requestInclude,
  });
  await logAudit({
    action: "UPDATE",
    tableName: "leave_requests",
    recordId: id,
    oldValues: request,
    newValues: updated,
  });
  return updated;
}

export async function revertRequest(id: string, reviewerUserId: string) {
  const request = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!request) throw new AppError(404, "Leave request not found");
  if (request.status !== "APPROVED" && request.status !== "REJECTED") {
    throw new AppError(409, "Only approved or rejected requests can be reverted");
  }

  // Block revert if the leave period overlaps a completed payroll run for this employee
  const completedRun = await prisma.payrollRun.findFirst({
    where: {
      status: "COMPLETED",
      periodStart: { lte: new Date(request.endDate) },
      periodEnd: { gte: new Date(request.startDate) },
      payslips: { some: { employeeId: request.employeeId } },
    },
    select: { id: true, periodStart: true, periodEnd: true },
  });

  if (completedRun) {
    const start = completedRun.periodStart.toISOString().slice(0, 10);
    const end = completedRun.periodEnd.toISOString().slice(0, 10);
    throw new AppError(
      409,
      `Cannot revert: a completed payroll run (${start} – ${end}) already covers this leave period.`
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Restore leave balance only if it was APPROVED (REJECTED never deducted)
    if (request.status === "APPROVED" && request.leaveType !== "UNPAID") {
      const year = new Date(request.startDate).getUTCFullYear();
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveType_year: {
            employeeId: request.employeeId,
            leaveType: request.leaveType,
            year,
          },
        },
      });
      if (balance) {
        const days = Number(request.totalDays);
        const newUsed = Math.max(0, Number(balance.usedDays) - days);
        const newRemaining = Number(balance.totalDays) - newUsed;
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: newUsed, remainingDays: newRemaining },
        });
      }
    }

    return tx.leaveRequest.update({
      where: { id },
      data: {
        status: "PENDING",
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
      },
      include: requestInclude,
    });
  });

  await logAudit({
    action: "UPDATE",
    tableName: "leave_requests",
    recordId: id,
    oldValues: request,
    newValues: updated,
  });

  return updated;
}

// --- Balances ---------------------------------------------------------------

export async function listBalances(query: ListLeaveBalancesQuery) {
  const where: Prisma.LeaveBalanceWhereInput = {};
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.year) where.year = query.year;
  return prisma.leaveBalance.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ year: "desc" }, { leaveType: "asc" }],
  });
}

export async function upsertBalance(input: UpsertLeaveBalanceInput) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true },
  });
  if (!employee) throw new AppError(404, "Employee not found");

  const existing = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveType_year: {
        employeeId: input.employeeId,
        leaveType: input.leaveType,
        year: input.year,
      },
    },
  });

  if (existing) {
    const used = Number(existing.usedDays);
    if (input.totalDays < used) {
      throw new AppError(
        400,
        `Total days cannot be less than already-used days (${used})`
      );
    }
    const updated = await prisma.leaveBalance.update({
      where: { id: existing.id },
      data: {
        totalDays: input.totalDays,
        remainingDays: input.totalDays - used,
      },
    });
    await logAudit({
      action: "UPDATE",
      tableName: "leave_balances",
      recordId: existing.id,
      oldValues: existing,
      newValues: updated,
    });
    return updated;
  }

  const created = await prisma.leaveBalance.create({
    data: {
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      year: input.year,
      totalDays: input.totalDays,
      usedDays: 0,
      remainingDays: input.totalDays,
    },
  });
  await logAudit({
    action: "CREATE",
    tableName: "leave_balances",
    recordId: created.id,
    newValues: created,
  });
  return created;
}

export async function upsertBalanceForAll(input: UpsertBalanceForAllInput) {
  const employees = await prisma.employee.findMany({
    where: { employmentStatus: { in: ["FULL_TIME", "PART_TIME", "TRAINEE"] } },
    select: { id: true },
  });

  let count = 0;
  for (const emp of employees) {
    const existing = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveType_year: {
          employeeId: emp.id,
          leaveType: input.leaveType,
          year: input.year,
        },
      },
    });

    if (existing) {
      const used = Number(existing.usedDays);
      await prisma.leaveBalance.update({
        where: { id: existing.id },
        data: {
          totalDays: input.totalDays,
          remainingDays: Math.max(0, input.totalDays - used),
        },
      });
    } else {
      await prisma.leaveBalance.create({
        data: {
          employeeId: emp.id,
          leaveType: input.leaveType,
          year: input.year,
          totalDays: input.totalDays,
          usedDays: 0,
          remainingDays: input.totalDays,
        },
      });
    }
    count++;
  }

  await logAudit({
    action: "CREATE",
    tableName: "leave_balances",
    recordId: "bulk",
    newValues: { leaveType: input.leaveType, year: input.year, totalDays: input.totalDays, count },
  });

  return { message: `Updated ${count} employee(s)`, count };
}
