import cron from "node-cron";
import prisma from "../config/db.js";
import { sendMail } from "./email.js";
import { getSetting } from "./settings-cache.js";
import { COMPANY_TZ } from "./timezone.js";
import { getScheduledTimes } from "../modules/attendance/attendance.service.js";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? 0),
    month: Number(parts.find((p) => p.type === "month")?.value ?? 0), // 1-indexed
    day: Number(parts.find((p) => p.type === "day")?.value ?? 0),
  };
}

function isMilestoneDay(
  hired: { year: number; month: number; day: number },
  today: { year: number; month: number; day: number },
  months: number,
): boolean {
  const totalMonths = (today.year - hired.year) * 12 + (today.month - hired.month);
  if (totalMonths !== months) return false;
  // Clamp hired day to the last day of today's month (handles e.g. Jan 31 + 3 months = Apr 30)
  const daysInMonth = new Date(today.year, today.month, 0).getDate();
  return today.day === Math.min(hired.day, daysInMonth);
}

function fmtDate(date: Date, tz: string) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: tz });
}

function fmtBirthday(date: Date, tz: string) {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz });
}

function getTomorrow(tz: string) {
  // Use Intl to get today in company TZ, then add 1 day in UTC to avoid DST issues
  const todayParts = getDateParts(new Date(), tz);
  const tomorrowUtc = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1));
  return getDateParts(tomorrowUtc, tz);
}

// ─── Email templates ──────────────────────────────────────────────────────────

const LOGO = `<img src="https://www.xn--kaoscaf-hya.com/kaos-logo.svg" alt="KAOS Café" style="height:36px;width:auto;display:block;margin-bottom:12px;filter:brightness(0) invert(1)" />`;

function milestone3MonthHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateHired: Date }[], tz: string) {
  const rows = employees.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:11px 16px;color:#111827;font-weight:600">${e.name}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.employeeId}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.position}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.branch}</td>
      <td style="padding:11px 16px;color:#6b7280">${fmtDate(e.dateHired, tz)}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#B10B0B,#811C12);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">3-Month Review Reminder</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Regularization evaluation due</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          The following employee${employees.length > 1 ? "s have" : " has"} reached their <strong>3-month employment mark</strong> today.
          Please review ${employees.length > 1 ? "their" : "their"} performance and initiate the regularization evaluation process.
        </p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Name</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">ID</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Position</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Branch</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Date Hired</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function milestoneYearlyHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateHired: Date; years: number }[], tz: string) {
  const rows = employees.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:11px 16px;color:#111827;font-weight:600">${e.name}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.employeeId}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.position}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.branch}</td>
      <td style="padding:11px 16px;color:#6b7280">${fmtDate(e.dateHired, tz)}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.years} ${e.years === 1 ? "year" : "years"}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#C17A2A,#8C1515);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Work Anniversary</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Employee milestone celebration</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          The following employee${employees.length > 1 ? "s have" : " has"} reached a <strong>work anniversary</strong> today.
          Be sure to recognize ${employees.length > 1 ? "their" : "their"} dedication and contributions!
        </p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Name</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">ID</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Position</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Branch</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Date Hired</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Tenure</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function milestone6MonthHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateHired: Date }[], tz: string) {
  const rows = employees.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:11px 16px;color:#111827;font-weight:600">${e.name}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.employeeId}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.position}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.branch}</td>
      <td style="padding:11px 16px;color:#6b7280">${fmtDate(e.dateHired, tz)}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#811C12,#280906);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">6-Month Benefits Eligibility</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Statutory benefits enrollment due</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          The following employee${employees.length > 1 ? "s have" : " has"} reached their <strong>6-month employment mark</strong> today.
          Please process their statutory benefits enrollment (SSS, PhilHealth, Pag-IBIG) if not yet done.
        </p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Name</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">ID</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Position</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Branch</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Date Hired</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function birthdayHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateOfBirth: Date }[], tz: string) {
  const rows = employees.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:11px 16px;color:#111827;font-weight:600">${e.name}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.employeeId}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.position}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.branch}</td>
      <td style="padding:11px 16px;color:#6b7280">${fmtBirthday(e.dateOfBirth, tz)}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#C17A2A,#B10B0B);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Birthday Tomorrow</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Don't forget to greet your team!</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          The following employee${employees.length > 1 ? "s have" : " has"} a birthday <strong>tomorrow</strong>.
          Take a moment to make ${employees.length > 1 ? "them" : "them"} feel appreciated!
        </p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Name</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">ID</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Position</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Branch</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Birthday</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ─── Birthday check ───────────────────────────────────────────────────────────

export async function checkUpcomingBirthdays() {
  try {
    const tz = COMPANY_TZ;
    const tomorrow = getTomorrow(tz);

    const employees = await prisma.employee.findMany({
      where: { employmentStatus: { in: ["FULL_TIME", "PART_TIME", "TRAINEE"] }, dateOfBirth: { not: null } },
      select: {
        employeeId: true, firstName: true, lastName: true,
        position: true, dateOfBirth: true,
        branch: { select: { name: true } },
      },
    });

    const celebrants = employees.filter((e) => {
      if (!e.dateOfBirth) return false;
      const dob = getDateParts(e.dateOfBirth, tz);
      // Feb 29 birthdays: notify on Feb 28 in non-leap years
      const daysInTomorrowMonth = new Date(tomorrow.year, tomorrow.month, 0).getDate();
      const effectiveDay = Math.min(dob.day, daysInTomorrowMonth);
      return dob.month === tomorrow.month && effectiveDay === tomorrow.day;
    });

    if (celebrants.length === 0) return;

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
      select: { email: true },
    });
    if (admins.length === 0) return;

    const names = celebrants.map((e) => `${e.firstName} ${e.lastName}`).join(", ");
    await sendMail({
      to: admins.map((u) => u.email),
      subject: celebrants.length === 1
        ? `🎂 Birthday Tomorrow: ${names}`
        : `🎂 Birthdays Tomorrow: ${celebrants.length} employees`,
      html: birthdayHtml(celebrants.map((e) => ({
        name: `${e.firstName} ${e.lastName}`,
        employeeId: e.employeeId,
        position: e.position,
        branch: e.branch.name,
        dateOfBirth: e.dateOfBirth!,
      })), tz),
    });
    console.log(`[scheduler] Birthday reminder sent for: ${names}`);
  } catch (err) {
    console.error("[scheduler] Birthday check failed:", err);
  }
}

// ─── Milestone check ──────────────────────────────────────────────────────────

export async function checkEmployeeMilestones() {
  try {
    const tz = COMPANY_TZ;
    const today = getDateParts(new Date(), tz);

    const employees = await prisma.employee.findMany({
      where: { employmentStatus: { in: ["FULL_TIME", "PART_TIME", "TRAINEE"] } },
      select: {
        employeeId: true, firstName: true, lastName: true,
        position: true, dateHired: true,
        branch: { select: { name: true } },
      },
    });

    const threeMonth: typeof employees = [];
    const sixMonth: typeof employees = [];
    const yearly: { emp: (typeof employees)[number]; years: number }[] = [];

    for (const emp of employees) {
      const hired = getDateParts(emp.dateHired, tz);
      const totalMonths = (today.year - hired.year) * 12 + (today.month - hired.month);
      if (isMilestoneDay(hired, today, 3)) threeMonth.push(emp);
      if (isMilestoneDay(hired, today, 6)) sixMonth.push(emp);
      if (totalMonths >= 12 && totalMonths % 12 === 0) {
        const daysInMonth = new Date(today.year, today.month, 0).getDate();
        if (today.day === Math.min(hired.day, daysInMonth)) {
          yearly.push({ emp, years: totalMonths / 12 });
        }
      }
    }

    if (threeMonth.length === 0 && sixMonth.length === 0 && yearly.length === 0) return;

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
      select: { email: true },
    });
    if (admins.length === 0) return;
    const recipients = admins.map((u) => u.email);

    const toRow = (e: (typeof employees)[number]) => ({
      name: `${e.firstName} ${e.lastName}`,
      employeeId: e.employeeId,
      position: e.position,
      branch: e.branch.name,
      dateHired: e.dateHired,
    });

    if (threeMonth.length > 0) {
      const names = threeMonth.map((e) => `${e.firstName} ${e.lastName}`).join(", ");
      await sendMail({
        to: recipients,
        subject: threeMonth.length === 1
          ? `3-Month Review Due: ${names}`
          : `3-Month Review Due: ${threeMonth.length} employees`,
        html: milestone3MonthHtml(threeMonth.map(toRow), tz),
      });
      console.log(`[scheduler] 3-month milestone email sent for: ${names}`);
    }

    if (sixMonth.length > 0) {
      const names = sixMonth.map((e) => `${e.firstName} ${e.lastName}`).join(", ");
      await sendMail({
        to: recipients,
        subject: sixMonth.length === 1
          ? `6-Month Benefits Eligibility: ${names}`
          : `6-Month Benefits Eligibility: ${sixMonth.length} employees`,
        html: milestone6MonthHtml(sixMonth.map(toRow), tz),
      });
      console.log(`[scheduler] 6-month milestone email sent for: ${names}`);
    }

    if (yearly.length > 0) {
      const names = yearly.map((e) => `${e.emp.firstName} ${e.emp.lastName}`).join(", ");
      await sendMail({
        to: recipients,
        subject: yearly.length === 1
          ? `Work Anniversary: ${names} — ${yearly[0].years} ${yearly[0].years === 1 ? "Year" : "Years"}`
          : `Work Anniversaries: ${yearly.length} employees`,
        html: milestoneYearlyHtml(yearly.map((e) => ({
          ...toRow(e.emp),
          years: e.years,
        })), tz),
      });
      console.log(`[scheduler] Work anniversary email sent for: ${names}`);
    }
  } catch (err) {
    console.error("[scheduler] Milestone check failed:", err);
  }
}

// ─── Absent check ─────────────────────────────────────────────────────────────

export async function checkAbsentEmployees() {
  try {
    const tz = COMPANY_TZ;
    const today = getDateParts(new Date(), tz);
    const todayUTC = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
    const thresholdHours = await getSetting<number>("attendance.absent_if_no_clockin", 4);
    const now = new Date();

    const allShifts = await prisma.shift.findMany({
      where: {
        date: { in: [yesterdayUTC, todayUTC] },
        status: "PUBLISHED",
      },
      include: {
        assignments: {
          include: {
            employee: { select: { branchId: true, payType: true, employmentStatus: true } },
          },
        },
      },
    });

    // Only process today's shifts plus yesterday's overnight shifts.
    // This avoids re-marking past regular shifts if the server was down.
    const shifts = allShifts.filter((s) => {
      if (s.date.getTime() === todayUTC.getTime()) return true;
      const startMins = s.startTime.getUTCHours() * 60 + s.startTime.getUTCMinutes();
      const endMins = s.endTime.getUTCHours() * 60 + s.endTime.getUTCMinutes();
      return endMins < startMins; // overnight shift from yesterday
    });

    if (shifts.length === 0) return;

    // Collect all assigned employee IDs for bulk attendance lookup.
    const allEmployeeIds = new Set<string>();
    for (const shift of shifts) {
      for (const a of shift.assignments) {
        allEmployeeIds.add(a.employeeId);
      }
    }

    // Fetch existing attendance records for all relevant employees across both dates.
    const existingRecords = await prisma.attendance.findMany({
      where: {
        employeeId: { in: [...allEmployeeIds] },
        date: { in: [yesterdayUTC, todayUTC] },
      },
      select: { employeeId: true, date: true },
    });

    // Build a set of "employeeId:dateKey" strings for O(1) lookup.
    const recordKeys = new Set(
      existingRecords.map((r) => `${r.employeeId}:${r.date.toISOString().slice(0, 10)}`),
    );

    // Fetch approved leaves for all relevant employees covering the date range.
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: [...allEmployeeIds] },
        status: "APPROVED",
        startDate: { lte: todayUTC },
        endDate: { gte: yesterdayUTC },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    });

    // Build a set of "employeeId:dateKey" for dates covered by approved leaves.
    const leaveDateKeys = new Set<string>();
    for (const leave of approvedLeaves) {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        leaveDateKeys.add(`${leave.employeeId}:${d.toISOString().slice(0, 10)}`);
      }
    }

    const processed = new Set<string>();
    let created = 0;

    for (const shift of shifts) {
      const { scheduledStart } = getScheduledTimes(shift.date, shift, tz);
      const cutoff = new Date(scheduledStart.getTime() + thresholdHours * 60 * 60 * 1000);

      if (now < cutoff) continue;

      const dateKey = shift.date.toISOString().slice(0, 10);

      for (const assignment of shift.assignments) {
        const eid = assignment.employeeId;
        const processedKey = `${eid}:${dateKey}`;

        if (assignment.employee.employmentStatus === "TERMINATED") continue;
        if (assignment.employee.payType !== "HOURLY") continue;
        if (processed.has(processedKey)) continue;
        if (recordKeys.has(`${eid}:${dateKey}`)) continue;

        const branchId = assignment.assignedBranchId ?? assignment.employee.branchId;
        const onLeave = leaveDateKeys.has(`${eid}:${dateKey}`);

        // clockIn is set to midnight PHT (00:00 local) so the UI displays 12:00 AM.
        // shift.date is midnight UTC; the ISO date string always equals the local date
        // since Asia/Manila is UTC+8 (ahead of UTC, never behind).
        const shiftDateStr = shift.date.toISOString().slice(0, 10);
        const midnightPht = new Date(`${shiftDateStr}T00:00:00.000+08:00`);

        await prisma.attendance.create({
          data: {
            employeeId: eid,
            branchId,
            date: shift.date,
            clockIn: midnightPht,
            status: onLeave ? "ON_LEAVE" : "ABSENT",
            source: "AUTO",
            syncStatus: "SYNCED",
          },
        });

        processed.add(processedKey);
        created++;
        console.log(`[scheduler] Auto-marked ${onLeave ? "on-leave" : "absent"}: ${eid} (shift: ${shift.name}, date: ${dateKey})`);
      }
    }

    if (created > 0) {
      console.log(`[scheduler] Auto-marked ${created} employee(s) absent`);
    }
  } catch (err) {
    console.error("[scheduler] Absent check failed:", err);
  }
}

// ─── Late clock-in reminder ────────────────────────────────────────────────────

const lateClockInSent = new Set<string>();

function lateClockInHtml(firstName: string, shiftName: string, shiftStart: string) {
  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#B10B0B,#811C12);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Clock-In Reminder</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Your shift has started</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          Hi <strong>${firstName}</strong>,
        </p>
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          Our records show that you <strong>have not yet clocked in</strong> for your scheduled shift today.
          Your shift <strong>${shiftName}</strong> started at <strong>${shiftStart}</strong>.
        </p>
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          Please clock in as soon as possible.
          If you believe this is a mistake or you are unable to report today, please contact your manager immediately.
        </p>
        <p style="margin:0;font-size:14px;color:#6b7280">
          Thank you,<br/>KAOS HRIS
        </p>
      </div>
    </div>`;
}

export async function checkLateClockIns() {
  try {
    const tz = COMPANY_TZ;
    const today = getDateParts(new Date(), tz);
    const todayUTC = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
    const now = new Date();
    const REMINDER_MINUTES = 30;

    const allShifts = await prisma.shift.findMany({
      where: {
        date: { in: [yesterdayUTC, todayUTC] },
        status: "PUBLISHED",
      },
      include: {
        assignments: {
          include: {
            employee: {
              select: {
                payType: true,
                employmentStatus: true,
                firstName: true,
                lastName: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
    });

    const shifts = allShifts.filter((s) => {
      if (s.date.getTime() === todayUTC.getTime()) return true;
      const startMins = s.startTime.getUTCHours() * 60 + s.startTime.getUTCMinutes();
      const endMins = s.endTime.getUTCHours() * 60 + s.endTime.getUTCMinutes();
      return endMins < startMins;
    });

    if (shifts.length === 0) return;

    const allEmployeeIds = new Set<string>();
    for (const shift of shifts) {
      for (const a of shift.assignments) {
        allEmployeeIds.add(a.employeeId);
      }
    }

    const existingRecords = await prisma.attendance.findMany({
      where: {
        employeeId: { in: [...allEmployeeIds] },
        date: { in: [yesterdayUTC, todayUTC] },
      },
      select: { employeeId: true, date: true },
    });
    const recordKeys = new Set(
      existingRecords.map((r) => `${r.employeeId}:${r.date.toISOString().slice(0, 10)}`),
    );

    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: [...allEmployeeIds] },
        status: "APPROVED",
        startDate: { lte: todayUTC },
        endDate: { gte: yesterdayUTC },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    });
    const leaveDateKeys = new Set<string>();
    for (const leave of approvedLeaves) {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        leaveDateKeys.add(`${leave.employeeId}:${d.toISOString().slice(0, 10)}`);
      }
    }

    for (const shift of shifts) {
      const { scheduledStart } = getScheduledTimes(shift.date, shift, tz);
      const minutesSinceStart = (now.getTime() - scheduledStart.getTime()) / (60 * 1000);

      if (minutesSinceStart < REMINDER_MINUTES) continue;

      const dateKey = shift.date.toISOString().slice(0, 10);

      for (const assignment of shift.assignments) {
        const emp = assignment.employee;
        if (emp.employmentStatus === "TERMINATED") continue;
        if (emp.payType !== "HOURLY") continue;

        const eid = assignment.employeeId;
        const notifyKey = `${eid}:${dateKey}`;

        if (lateClockInSent.has(notifyKey)) continue;
        if (recordKeys.has(`${eid}:${dateKey}`)) continue;
        if (leaveDateKeys.has(`${eid}:${dateKey}`)) continue;

        const email = emp.user?.email;
        if (!email) continue;

        const shiftStartStr = scheduledStart.toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
        });

        await sendMail({
          to: email,
          subject: "Reminder: Please clock in for your shift today",
          html: lateClockInHtml(emp.firstName, shift.name, shiftStartStr),
        });

        lateClockInSent.add(notifyKey);
        console.log(`[scheduler] Late clock-in reminder sent to ${eid} (${email})`);
      }
    }
  } catch (err) {
    console.error("[scheduler] Late clock-in check failed:", err);
  }
}

// ─── Start scheduler ──────────────────────────────────────────────────────────

export async function startScheduler() {
  const tz = COMPANY_TZ;
  cron.schedule("0 8 * * *", async () => {
    await checkEmployeeMilestones();
    await checkUpcomingBirthdays();
  }, { timezone: tz });
  console.log(`[scheduler] Daily checks scheduled — 08:00 ${tz} (milestones + birthdays)`);

  cron.schedule("0 * * * *", async () => {
    await checkAbsentEmployees();
  }, { timezone: tz });
  console.log(`[scheduler] Hourly absent check scheduled — ${tz}`);

  cron.schedule("*/5 * * * *", async () => {
    await checkLateClockIns();
  }, { timezone: tz });
  console.log(`[scheduler] Every-5-min late clock-in check scheduled — ${tz}`);
}
