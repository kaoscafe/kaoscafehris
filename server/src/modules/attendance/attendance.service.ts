import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import { getSetting } from "../../lib/settings-cache.js";
import { COMPANY_TZ, localDateKey, localMidnightUtc } from "../../lib/timezone.js";
import type {
  ClockInInput,
  ClockOutInput,
  ListAttendanceQuery,
  ManualAdjustInput,
  ManualCreateInput,
  SyncBatchInput,
} from "./attendance.schema.js";

const attendanceInclude = {
  employee: {
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      position: true,
    },
  },
  branch: { select: { id: true, name: true } },
} as const;

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/**
 * Return the local calendar date of `instant` in the company timezone, with
 * NO split-time rollback. Used for manual attendance creation where the admin
 * has explicitly chosen the intended date.
 */
export async function localCalendarDateOf(instant: Date): Promise<Date> {
  const tz = COMPANY_TZ;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

function diffMinutes(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

/**
 * Compute late minutes relative to scheduledStart.
 * resolveAttendanceDateAndShift already pairs the clock-in with the correct
 * shift and date, so early clock-ins produce a negative delta (→ 0 late minutes)
 * and late clock-ins produce a positive delta directly.
 */
function computeLateMinutes(scheduledStart: Date, clockIn: Date): number {
  return Math.max(0, diffMinutes(scheduledStart, clockIn));
}

export function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 100) / 100);
}

/**
 * Find the employee's scheduled shift for a given date (if any).
 * When the employee has multiple shifts on the same day, returns the one
 * whose scheduled start time is closest to `clockInAt` (in local time).
 * `tz` is the IANA timezone name (e.g. "Asia/Manila").
 */
async function findScheduledShift(
  employeeId: string,
  date: Date,
  clockInAt?: Date,
  tz = "Asia/Manila",
) {
  const assignments = await prisma.shiftAssignment.findMany({
    where: { employeeId, shift: { date } },
    include: { shift: true },
    orderBy: { shift: { startTime: "asc" } },
  });

  if (assignments.length === 0) return null;
  if (assignments.length === 1 || !clockInAt) return assignments[0].shift;

  // Multiple shifts on the same day — pick the one whose start is closest to clock-in.
  let best = assignments[0].shift;
  let minDiff = Infinity;
  for (const { shift } of assignments) {
    const { scheduledStart } = getScheduledTimes(date, shift, tz);
    const diff = Math.abs(clockInAt.getTime() - scheduledStart.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      best = shift;
    }
  }
  return best;
}

/**
 * Resolve the correct attendance date and matching shift for a clock-in.
 *
 * Tries the naive local calendar date first. If no shift is found there, checks
 * the previous date for overnight shifts (end time earlier than start time) whose
 * computed window contains the clock-in. A strict < on scheduledEnd ensures that
 * a clock-in at exactly the boundary (e.g. 7:00 AM when overnight ends at 7:00)
 * goes to the current day's shift, not the graveyard.
 */
async function resolveAttendanceDateAndShift(
  employeeId: string,
  clockInAt: Date,
  tz: string,
): Promise<{ date: Date; shift: Awaited<ReturnType<typeof findScheduledShift>> }> {
  const naiveDate = await localCalendarDateOf(clockInAt);
  const naiveShift = await findScheduledShift(employeeId, naiveDate, clockInAt, tz);

  // Compute the previous calendar date (UTC-based is fine since date-only doesn't have DST ambiguity).
  const prevDate = new Date(naiveDate);
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);

  // Look for overnight shifts on the previous date whose window contains the clock-in.
  const prevAssignments = await prisma.shiftAssignment.findMany({
    where: { employeeId, shift: { date: prevDate } },
    include: { shift: true },
  });

  let bestPrevShift: typeof naiveShift = null;
  let bestPrevDiff = Infinity;

  for (const { shift } of prevAssignments) {
    const startMins = shift.startTime.getUTCHours() * 60 + shift.startTime.getUTCMinutes();
    const endMins = shift.endTime.getUTCHours() * 60 + shift.endTime.getUTCMinutes();
    if (endMins >= startMins) continue; // not an overnight shift

    const { scheduledStart, scheduledEnd } = getScheduledTimes(prevDate, shift, tz);
    // Strict < on scheduledEnd so exactly-at-boundary goes to the current day.
    if (clockInAt >= scheduledStart && clockInAt < scheduledEnd) {
      const diff = Math.abs(clockInAt.getTime() - scheduledStart.getTime());
      if (diff < bestPrevDiff) {
        bestPrevDiff = diff;
        bestPrevShift = shift;
      }
    }
  }

  // If the employee already completed attendance for all of their scheduled
  // shifts on the previous date, don't resolve to it — their graveyard shift
  // is done, and this clock-in belongs to the naive date (or a new shift).
  if (bestPrevShift && prevAssignments.length > 0) {
    const prevCompletedCount = await prisma.attendance.count({
      where: { employeeId, date: prevDate, clockOut: { not: null } },
    });
    if (prevCompletedCount >= prevAssignments.length) {
      bestPrevShift = null;
      bestPrevDiff = Infinity;
    }
  }

  // Prefer the previous date's overnight shift when it is a better match
  // (closer to clockInAt) than anything on the naive date. This handles the
  // case where an employee clocks in late for a graveyard shift (e.g. 2 AM
  // on May 1 for an Apr 30 3rd shift) but also has a shift on May 1 — the
  // Apr 30 shift is only 4 hours away while the May 1 3rd shift (starting
  // at 10 PM) is 20 hours away.
  let naiveDiff = Infinity;
  if (naiveShift) {
    const { scheduledStart } = getScheduledTimes(naiveDate, naiveShift, tz);
    naiveDiff = Math.abs(clockInAt.getTime() - scheduledStart.getTime());
  }

  if (bestPrevShift && bestPrevDiff < naiveDiff) {
    return { date: prevDate, shift: bestPrevShift };
  }
  return { date: naiveDate, shift: naiveShift };
}

/** Combine a date (UTC midnight) with a time-of-day (from @db.Time field). */
function combineDateAndTime(date: Date, timeOfDay: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      timeOfDay.getUTCHours(),
      timeOfDay.getUTCMinutes(),
      0
    )
  );
}

/**
 * Return the UTC offset in minutes for `tz` at `forDate`.
 * E.g. Asia/Manila → 480 (UTC+8). Handles DST-observing zones correctly.
 */
export function getUtcOffsetMinutes(tz: string, forDate: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(forDate);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const localMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((localMs - forDate.getTime()) / 60_000);
}

/**
 * Like combineDateAndTime but treats the stored @db.Time hours/minutes as
 * LOCAL company timezone time rather than UTC. Shift times are entered by
 * admins in local time (e.g. "08:00" = 8 AM Manila), so we must subtract the
 * UTC offset to arrive at the correct UTC instant.
 */
function combineDateAndTimeLocal(date: Date, timeOfDay: Date, tz: string): Date {
  const dateKey = localDateKey(date, tz);
  const midnightUtc = localMidnightUtc(dateKey, tz);
  const timeMs = timeOfDay.getUTCHours() * 3_600_000 + timeOfDay.getUTCMinutes() * 60_000;
  return new Date(midnightUtc.getTime() + timeMs);
}

/**
 * Returns the scheduled start and end instants for a shift on a given date.
 * tz is the IANA timezone name (e.g. "Asia/Manila").
 * Handles overnight/graveyard shifts where endTime < startTime by adding one
 * day to scheduledEnd so it lands on the correct calendar day.
 */
export function getScheduledTimes(
  date: Date,
  shift: { startTime: Date; endTime: Date },
  tz: string,
) {
  const scheduledStart = combineDateAndTimeLocal(date, shift.startTime, tz);
  let scheduledEnd = combineDateAndTimeLocal(date, shift.endTime, tz);
  const startMins = shift.startTime.getUTCHours() * 60 + shift.startTime.getUTCMinutes();
  const endMins = shift.endTime.getUTCHours() * 60 + shift.endTime.getUTCMinutes();
  if (endMins < startMins) {
    scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  return { scheduledStart, scheduledEnd };
}

export async function deleteAttendance(id: string) {
  const record = await prisma.attendance.findUnique({ where: { id } });
  if (!record) throw new AppError(404, "Attendance record not found");
  await prisma.attendance.delete({ where: { id } });
}

export async function listAttendance(query: ListAttendanceQuery) {
  const where: Prisma.AttendanceWhereInput = {};
  if (query.branchId) where.branchId = query.branchId;
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.status) where.status = query.status;
  if (query.date) where.date = dateOnly(query.date);
  else if (query.startDate || query.endDate) {
    where.date = {};
    if (query.startDate) where.date.gte = dateOnly(query.startDate);
    if (query.endDate) where.date.lte = dateOnly(query.endDate);
  }

  const records = await prisma.attendance.findMany({
    where,
    include: attendanceInclude,
    orderBy: [{ date: "desc" }, { clockIn: "desc" }],
    take: 500,
  });

  if (records.length === 0) return records.map((r) => ({ ...r, hasShift: false }));

  // Collect unique dates to query shift assignments in one batch
  const uniqueDates = [...new Set(records.map((r) => r.date.toISOString().slice(0, 10)))];
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      shift: { date: { in: uniqueDates.map((d) => dateOnly(d)) } },
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    },
    select: { employeeId: true, shift: { select: { date: true, name: true } } },
  });

  const shiftMap = new Map(
    assignments.map((a) => [`${a.employeeId}:${a.shift.date.toISOString().slice(0, 10)}`, a.shift.name]),
  );

  return records.map((r) => {
    const key = `${r.employeeId}:${r.date.toISOString().slice(0, 10)}`;
    return {
      ...r,
      hasShift: shiftMap.has(key),
      shiftName: shiftMap.get(key) ?? null,
    };
  });
}

export async function getAttendance(id: string) {
  const record = await prisma.attendance.findUnique({
    where: { id },
    include: attendanceInclude,
  });
  if (!record) throw new AppError(404, "Attendance record not found");
  return record;
}

export async function getAssignedShift(employeeId: string, date: string) {
  const assignment = await prisma.shiftAssignment.findFirst({
    where: { employeeId, shift: { date: dateOnly(date) } },
    include: { shift: { select: { id: true, name: true, startTime: true, endTime: true } } },
    orderBy: { shift: { startTime: "asc" } },
  });
  if (!assignment) return null;
  return {
    id: assignment.shift.id,
    name: assignment.shift.name,
    startTime: assignment.shift.startTime,
    endTime: assignment.shift.endTime,
    overtimeApproved: assignment.overtimeApproved,
    overtimeRejected: assignment.overtimeRejected,
  };
}

/**
 * Clock-in creates a new attendance record for today. Rejects if one already
 * exists for the employee on the same date (unique constraint makes this
 * deterministic).
 */
export async function clockIn(input: ClockInInput, options?: { skipOpenRecordGuard?: boolean }) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, branchId: true, employmentStatus: true },
  });
  if (!employee) throw new AppError(404, "Employee not found");
  if (employee.employmentStatus === "TERMINATED") {
    throw new AppError(400, "Terminated employees cannot clock in");
  }

  let clockInAt = input.clockIn ? new Date(input.clockIn) : new Date();
  // Resolve the correct attendance date and matching shift. For graveyard shifts
  // (e.g. 11 PM → 7 AM), a clock-in after midnight will be attributed to the
  // previous date where the shift is actually scheduled.
  const { date: effectiveDateKey, shift } = await resolveAttendanceDateAndShift(
    input.employeeId,
    clockInAt,
    COMPANY_TZ,
  );

  // Idempotency for offline sync: if a localRecordId matches an existing row,
  // return it instead of creating a duplicate.
  if (input.localRecordId) {
    const existing = await prisma.attendance.findFirst({
      where: { employeeId: input.employeeId, localRecordId: input.localRecordId },
      include: attendanceInclude,
    });
    if (existing) return existing;
  }

  if (!shift) {
    throw new AppError(400, "No shift assigned for this date. Please contact your manager.");
  }

  const tz = COMPANY_TZ;
  const graceMinutes = await getSetting<number>("attendance.late_threshold", 0);
  const thresholdHours = await getSetting<number>("attendance.absent_if_no_clockin", 4);

  // If the scheduler already created an auto-absent placeholder, update it
  // in-place instead of blocking the clock-in.  The scheduler stores clockIn
  // as midnight PHT (Asia/Manila = UTC+8) so the UI shows 12:00 AM local time.
  // Admin-set ABSENT records have a different clockIn and are intentionally
  // skipped here — those stay as-is and block re-clock-in.
  const effectiveDateStr = effectiveDateKey.toISOString().slice(0, 10);
  const midnightPht = new Date(`${effectiveDateStr}T00:00:00.000+08:00`);
  const autoAbsent = await prisma.attendance.findFirst({
    where: {
      employeeId: input.employeeId,
      date: effectiveDateKey,
      status: "ABSENT",
      source: { in: ["MANUAL", "AUTO"] },
      clockIn: midnightPht,
    },
  });

  if (!autoAbsent && !options?.skipOpenRecordGuard) {
    // Block if there's an open (no clock-out) record from a PREVIOUS date.
    const openPrevRecord = await prisma.attendance.findFirst({
      where: {
        employeeId: input.employeeId,
        clockOut: null,
        status: { in: ["PRESENT", "LATE"] },
        date: { lt: effectiveDateKey },
      },
    });
    if (openPrevRecord) {
      throw new AppError(
        409,
        "Employee has not clocked out from a previous shift. Please clock out first."
      );
    }

    // Block if there's already an open record for TODAY (must clock out first).
    const openTodayRecord = await prisma.attendance.findFirst({
      where: {
        employeeId: input.employeeId,
        clockOut: null,
        status: { in: ["PRESENT", "LATE"] },
        date: effectiveDateKey,
      },
    });
    if (openTodayRecord) {
      throw new AppError(409, "Employee has not clocked out from the current shift. Please clock out first.");
    }

    // Block if the employee has already clocked in for all of their scheduled shifts today.
    const [existingCount, scheduledCount] = await Promise.all([
      prisma.attendance.count({ where: { employeeId: input.employeeId, date: effectiveDateKey } }),
      prisma.shiftAssignment.count({ where: { employeeId: input.employeeId, shift: { date: effectiveDateKey } } }),
    ]);
    if (existingCount > 0 && existingCount >= Math.max(scheduledCount, 1)) {
      throw new AppError(
        409,
        scheduledCount > 1
          ? "Employee has already clocked in for all scheduled shifts today."
          : "Employee has already clocked in for this date."
      );
    }
  }

  let status: "PRESENT" | "LATE" | "ABSENT" = "PRESENT";
  let lateMinutes: number | null = null;
  let remarks: string | undefined;

  if (shift) {
    const { scheduledStart } = getScheduledTimes(effectiveDateKey, shift, tz);

    // Auto-correct: when clockIn is before the shift start, the shift is
    // overnight, and clockIn is in the morning (before noon), the clockIn is
    // really the next morning. Skip evening hours to avoid penalizing early
    // clock-ins (e.g. 10pm for an 11pm shift).
    let correctedClockIn = clockInAt;
    if (clockInAt < scheduledStart) {
      const startUtc = shift.startTime.getUTCHours() * 60 + shift.startTime.getUTCMinutes();
      const endUtc = shift.endTime.getUTCHours() * 60 + shift.endTime.getUTCMinutes();
      const localHour = new Date(clockInAt.toLocaleString("en-US", { timeZone: tz })).getHours();
      if (endUtc < startUtc && localHour < 12) {
        correctedClockIn = new Date(clockInAt.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const delta = computeLateMinutes(scheduledStart, correctedClockIn);
    if (delta > graceMinutes) {
      lateMinutes = delta;
      if (delta >= thresholdHours * 60) {
        status = "ABSENT";
        const hrs = Math.floor(delta / 60);
        const mins = delta % 60;
        remarks = mins > 0 ? `${hrs} hrs ${mins} mins late` : `${hrs} hrs late`;
      } else {
        status = "LATE";
      }
    }

    // If corrected, use the corrected time for storage so payroll/holiday
    // attribution uses the right calendar date.
    if (correctedClockIn.getTime() !== clockInAt.getTime()) {
      clockInAt = correctedClockIn;
    }
  }

  if (autoAbsent) {
    return prisma.attendance.update({
      where: { id: autoAbsent.id },
      data: {
        clockIn: clockInAt,
        status,
        lateMinutes: lateMinutes ?? null,
        remarks: remarks ?? null,
        selfieIn: input.selfieIn ?? null,
        clockInNote: input.clockInNote ?? null,
        source: "KIOSK",
        deviceId: input.deviceId ?? null,
        localRecordId: input.localRecordId ?? null,
      },
      include: attendanceInclude,
    });
  }

  return prisma.attendance.create({
    data: {
      employeeId: input.employeeId,
      branchId: employee.branchId,
      date: effectiveDateKey,
      clockIn: clockInAt,
      status,
      lateMinutes: lateMinutes ?? undefined,
      remarks: remarks ?? undefined,
      selfieIn: input.selfieIn,
      clockInNote: input.clockInNote ?? undefined,
      deviceId: input.deviceId,
      localRecordId: input.localRecordId,
      source: "KIOSK",
      syncStatus: "SYNCED",
    },
    include: attendanceInclude,
  });
}

export async function clockOut(attendanceId: string, input: ClockOutInput) {
  const record = await prisma.attendance.findUnique({ where: { id: attendanceId } });
  if (!record) throw new AppError(404, "Attendance record not found");
  if (record.clockOut) throw new AppError(409, "Already clocked out");

  const clockOutAt = input.clockOut ? new Date(input.clockOut) : new Date();
  if (clockOutAt <= record.clockIn) {
    throw new AppError(400, "Clock-out time must be after clock-in");
  }
  const minClockOutAt = new Date(record.clockIn.getTime() + 60 * 60 * 1000);
  if (clockOutAt < minClockOutAt) {
    throw new AppError(400, "Cannot clock out within 1 hour of clocking in");
  }

  const hoursWorked = hoursBetween(record.clockIn, clockOutAt);
  let overtimeHours = 0;
  let undertimeMinutes: number | null = null;

  const tz = COMPANY_TZ;
  const shift = await findScheduledShift(record.employeeId, record.date, record.clockIn, tz);
  if (shift) {
    const { scheduledEnd } = getScheduledTimes(record.date, shift, tz);
    if (clockOutAt < scheduledEnd) {
      undertimeMinutes = diffMinutes(clockOutAt, scheduledEnd);
    }
    if (clockOutAt > scheduledEnd) {
      overtimeHours = hoursBetween(scheduledEnd, clockOutAt);
    }
  }

  return prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      clockOut: clockOutAt,
      selfieOut: input.selfieOut,
      clockOutNote: input.clockOutNote ?? undefined,
      hoursWorked,
      overtimeHours,
      undertimeMinutes: undertimeMinutes ?? undefined,
    },
    include: attendanceInclude,
  });
}

export async function manualAdjust(id: string, input: ManualAdjustInput) {
  const existing = await prisma.attendance.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Attendance record not found");

  const data: Prisma.AttendanceUpdateInput = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.remarks !== undefined) data.remarks = input.remarks;

  const nextClockIn = input.clockIn !== undefined ? new Date(input.clockIn) : existing.clockIn;
  const nextClockOut =
    input.clockOut === undefined
      ? existing.clockOut
      : input.clockOut ? new Date(input.clockOut) : null;

  if (nextClockOut && nextClockOut <= nextClockIn) {
    throw new AppError(400, "Clock-out time must be after clock-in");
  }

  // If clockIn changed, resolve the correct date and shift for the new time.
  let nextDate = existing.date;
  let shift: Awaited<ReturnType<typeof findScheduledShift>> = null;
  const tz = COMPANY_TZ;
  if (input.clockIn !== undefined) {
    const resolved = await resolveAttendanceDateAndShift(existing.employeeId, nextClockIn, tz);
    nextDate = resolved.date;
    shift = resolved.shift;
    if (nextDate.getTime() !== existing.date.getTime()) {
      data.date = nextDate;
    }
  } else {
    shift = await findScheduledShift(existing.employeeId, nextDate, nextClockIn, tz);
  }

  data.clockIn = nextClockIn;
  data.clockOut = nextClockOut ?? null;

  const graceMinutes = await getSetting<number>("attendance.late_threshold", 0);

  // Recompute derived fields from the resolved clockIn/clockOut,
  // unless the caller provides an explicit override for a field.
  if (nextClockOut) {
    data.hoursWorked = hoursBetween(nextClockIn, nextClockOut);

    if (shift) {
      const { scheduledEnd } = getScheduledTimes(nextDate, shift, tz);
      if (input.undertimeMinutes !== undefined) {
        data.undertimeMinutes = input.undertimeMinutes;
      } else {
        data.undertimeMinutes = nextClockOut < scheduledEnd ? diffMinutes(nextClockOut, scheduledEnd) : null;
      }
      if (input.overtimeHours !== undefined) {
        data.overtimeHours = input.overtimeHours;
      } else {
        data.overtimeHours = nextClockOut > scheduledEnd ? hoursBetween(scheduledEnd, nextClockOut) : 0;
      }
    } else {
      data.overtimeHours = input.overtimeHours ?? 0;
      data.undertimeMinutes = input.undertimeMinutes ?? null;
    }
  } else {
    // No clock-out yet — clear computed fields.
    data.hoursWorked = null;
    data.overtimeHours = 0;
    data.undertimeMinutes = null;
  }

  // ABSENT, HALF_DAY, and ON_LEAVE are admin-only overrides; LATE/PRESENT are always auto-computed.
  if (input.status === "ABSENT" || input.status === "HALF_DAY" || input.status === "ON_LEAVE") {
    data.status = input.status;
    data.lateMinutes = null;
  } else {
    // Auto-compute PRESENT vs LATE from clock-in vs scheduled shift start.
    if (shift) {
      const { scheduledStart } = getScheduledTimes(nextDate, shift, tz);
      const delta = computeLateMinutes(scheduledStart, nextClockIn);
      if (delta > graceMinutes) {
        data.status = "LATE";
        data.lateMinutes = delta;
      } else {
        data.status = "PRESENT";
        data.lateMinutes = null;
      }
    } else {
      data.status = "PRESENT";
      data.lateMinutes = null;
    }
  }

  return prisma.attendance.update({
    where: { id },
    data,
    include: attendanceInclude,
  });
}

export async function manualCreate(input: ManualCreateInput) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, branchId: true, employmentStatus: true },
  });
  if (!employee) throw new AppError(404, "Employee not found");

  const clockInAt = new Date(input.clockIn);
  const tz = COMPANY_TZ;
  const graceMinutes = await getSetting<number>("attendance.late_threshold", 0);

  // Resolve the correct date from the employee's shift assignment so graveyard
  // shifts are attributed to the scheduled date, not the calendar date.
  const { date: dateKey, shift: assignedShift } = await resolveAttendanceDateAndShift(
    input.employeeId, clockInAt, tz,
  );

  // Block if there is already an open (no clock-out) record for the resolved date.
  const openTodayRecord = await prisma.attendance.findFirst({
    where: {
      employeeId: input.employeeId,
      clockOut: null,
      status: { in: ["PRESENT", "LATE"] },
      date: dateKey,
    },
  });
  if (openTodayRecord) {
    throw new AppError(409, "Employee has an open shift today. Please clock out first before adding another record.");
  }

  // Block if all scheduled shifts for the resolved date already have attendance records.
  const [existingCount, scheduledCount] = await Promise.all([
    prisma.attendance.count({ where: { employeeId: input.employeeId, date: dateKey } }),
    prisma.shiftAssignment.count({ where: { employeeId: input.employeeId, shift: { date: dateKey } } }),
  ]);
  if (existingCount > 0 && existingCount >= Math.max(scheduledCount, 1)) {
    throw new AppError(
      409,
      scheduledCount > 1
        ? "Attendance records already exist for all scheduled shifts on this date."
        : "An attendance record already exists for this employee on that date."
    );
  }

  // Always use the shift type selected by the admin — even when the employee
  // already has a different shift assigned on the Schedule tab.  The admin's
  // manual override takes priority for late/overtime computation.
  const st = await prisma.shiftType.findUnique({ where: { id: input.shiftTypeId } });
  if (!st) throw new AppError(404, "Shift type not found");
  const shiftType = st;

  const { scheduledStart, scheduledEnd } = getScheduledTimes(dateKey, shiftType, tz);

  // Auto-correct: when clockIn is before the shift start, the shift is
  // overnight, and clockIn is in the morning (before noon), the clockIn is
  // really the next morning. Skip evening hours to avoid penalizing early
  // clock-ins (e.g. 10pm for an 11pm shift).
  let correctedClockIn = clockInAt;
  if (clockInAt < scheduledStart) {
    const startUtc = shiftType.startTime.getUTCHours() * 60 + shiftType.startTime.getUTCMinutes();
    const endUtc = shiftType.endTime.getUTCHours() * 60 + shiftType.endTime.getUTCMinutes();
    const localHour = new Date(clockInAt.toLocaleString("en-US", { timeZone: tz })).getHours();
    if (endUtc < startUtc && localHour < 12) {
      correctedClockIn = new Date(clockInAt.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  let status: "PRESENT" | "LATE" = "PRESENT";
  let lateMinutes: number | null = null;

  const delta = computeLateMinutes(scheduledStart, correctedClockIn);
  if (delta > graceMinutes) {
    status = "LATE";
    lateMinutes = delta;
  }

  let clockOutAt: Date | null = null;
  let hoursWorked: number | undefined;
  let overtimeHours: number | undefined;
  let undertimeMinutes: number | undefined;

  if (input.clockOut) {
    clockOutAt = new Date(input.clockOut);
    // If clockIn was auto-corrected for an overnight shift, shift clockOut
    // forward as well — the admin likely entered both on the same (wrong) day.
    if (correctedClockIn.getTime() !== clockInAt.getTime()) {
      clockOutAt = new Date(clockOutAt.getTime() + 24 * 60 * 60 * 1000);
    }
    if (clockOutAt <= correctedClockIn) {
      throw new AppError(400, "Clock-out time must be after clock-in");
    }
    hoursWorked = hoursBetween(correctedClockIn, clockOutAt);
    if (clockOutAt < scheduledEnd) undertimeMinutes = diffMinutes(clockOutAt, scheduledEnd);
    if (clockOutAt > scheduledEnd) overtimeHours = hoursBetween(scheduledEnd, clockOutAt);
  }

  return prisma.$transaction(async (tx) => {
    // Ensure a Shift + ShiftAssignment exist for the admin-selected shift type
    // so the record shows on the Schedule tab.  When the employee already has a
    // different shift assigned, this reassigns them to the admin's choice.
    const existingShift = await tx.shift.findFirst({
      where: { date: dateKey, shiftTypeId: shiftType.id, branchId: employee.branchId },
      select: { id: true },
    });
    const shift = existingShift ?? await tx.shift.create({
      data: {
        branchId: employee.branchId,
        shiftTypeId: shiftType.id,
        name: shiftType.name,
        date: dateKey,
        startTime: shiftType.startTime,
        endTime: shiftType.endTime,
        status: "PUBLISHED",
      },
      select: { id: true },
    });

    // Remove the employee's old shift assignment when the admin overrides it
    // with a different shift type, so the employee is only assigned once.
    if (assignedShift && assignedShift.shiftTypeId !== shiftType.id) {
      await tx.shiftAssignment.deleteMany({
        where: { employeeId: input.employeeId, shift: { date: dateKey } },
      });
    }

    await tx.shiftAssignment.upsert({
      where: { shiftId_employeeId: { shiftId: shift.id, employeeId: input.employeeId } },
      create: { shiftId: shift.id, employeeId: input.employeeId },
      update: {},
    });

    return tx.attendance.create({
      data: {
        employeeId: input.employeeId,
        branchId: employee.branchId,
        date: dateKey,
        clockIn: correctedClockIn,
        clockOut: clockOutAt ?? undefined,
        status,
        lateMinutes: lateMinutes ?? undefined,
        hoursWorked,
        overtimeHours,
        undertimeMinutes,
        remarks: input.remarks ?? undefined,
        source: "MANUAL",
        syncStatus: "SYNCED",
      },
      include: attendanceInclude,
    });
  });
}

export async function syncBatch(input: SyncBatchInput) {
  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { localRecordId: string; reason: string }[] = [];

  // Process in chronological order so a Day-1 clock-out is committed before
  // the Day-2 clock-in runs, avoiding false open-record conflicts.
  const sorted = [...input.records].sort(
    (a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime()
  );

  for (const record of sorted) {
    try {
      const existing = await prisma.attendance.findFirst({
        where: { employeeId: record.employeeId, localRecordId: record.localRecordId },
      });
      if (existing) {
        skipped.push(record.localRecordId);
        continue;
      }
      await clockIn(
        {
          employeeId: record.employeeId,
          clockIn: record.clockIn,
          selfieIn: record.selfieIn,
          deviceId: record.deviceId,
          localRecordId: record.localRecordId,
        },
        { skipOpenRecordGuard: true },
      );
      if (record.clockOut) {
        const row = await prisma.attendance.findFirst({
          where: { employeeId: record.employeeId, localRecordId: record.localRecordId },
        });
        if (row) {
          await clockOut(row.id, {
            clockOut: record.clockOut,
            selfieOut: record.selfieOut,
          });
        }
      }
      created.push(record.localRecordId);
    } catch (err) {
      failed.push({
        localRecordId: record.localRecordId,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { created, skipped, failed };
}

/**
 * One-time fix for existing MANUAL attendance records on overnight shifts
 * where clockIn/clockOut were entered on the wrong calendar day (the
 * attendance date instead of the next morning). Adding 1 day to both
 * timestamps fixes late detection and holiday pay crediting.
 */
export async function fixOvernightClocks() {
  const tz = COMPANY_TZ;
  const records = await prisma.attendance.findMany({
    where: { source: "MANUAL", clockOut: { not: null } },
    select: { id: true, employeeId: true, date: true, clockIn: true, clockOut: true },
  });

  // Batch-load shift assignments for all (employeeId, date) pairs.
  const dateKeys = [...new Set(records.map((r) => r.date.toISOString().slice(0, 10)))];
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      employeeId: { in: [...new Set(records.map((r) => r.employeeId))] },
      shift: { date: { in: dateKeys.map((d) => new Date(d + "T00:00:00.000Z")) } },
    },
    include: { shift: { include: { shiftType: true } } },
  });

  const shiftMap = new Map<string, typeof assignments[number]>();
  for (const a of assignments) {
    shiftMap.set(`${a.employeeId}:${a.shift.date.toISOString().slice(0, 10)}`, a);
  }

  let updated = 0;

  for (const rec of records) {
    const dateKey = rec.date.toISOString().slice(0, 10);
    const sa = shiftMap.get(`${rec.employeeId}:${dateKey}`);
    const st = sa?.shift?.shiftType;
    if (!st) continue;

    const startUtc = st.startTime.getUTCHours() * 60 + st.startTime.getUTCMinutes();
    const endUtc = st.endTime.getUTCHours() * 60 + st.endTime.getUTCMinutes();
    if (endUtc >= startUtc) continue; // not overnight

    const localHour = new Date(rec.clockIn.toLocaleString("en-US", { timeZone: tz })).getHours();
    if (localHour >= 12) continue; // not a morning clock-in

    // If clockIn local date equals the attendance date, the timestamps were
    // entered on the wrong day (should be the next morning).
    const clockInLocalDate = rec.clockIn.toLocaleString("en-US", { timeZone: tz }).slice(0, 10);
    if (clockInLocalDate !== dateKey) continue; // already correct

    const newClockIn = new Date(rec.clockIn.getTime() + 24 * 60 * 60 * 1000);
    const newClockOut = new Date(rec.clockOut!.getTime() + 24 * 60 * 60 * 1000);

    await prisma.attendance.update({
      where: { id: rec.id },
      data: { clockIn: newClockIn, clockOut: newClockOut },
    });
    updated++;
  }

  return { updated };
}
