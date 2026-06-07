import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";
import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import { getSetting, getDayCutoffHour } from "../../lib/settings-cache.js";
import { COMPANY_TZ } from "../../lib/timezone.js";
import * as attendanceService from "../attendance/attendance.service.js";
import { localCalendarDateOf, getScheduledTimes, EARLY_CLOCK_IN_WINDOW_MS } from "../attendance/attendance.service.js";

const uploadsBase = process.env.UPLOADS_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "uploads");
const selfieDir = path.join(uploadsBase, "selfies");
fs.mkdirSync(selfieDir, { recursive: true });

const selfieUpload = multer({
  storage: multer.diskStorage({
    destination: selfieDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const router = Router();

function isIpAllowed(clientIp: string, allowedList: string): boolean {
  if (!allowedList.trim()) return true;
  const entries = allowedList.split(",").map((s) => s.trim()).filter(Boolean);
  const normalized = clientIp.replace(/^::ffff:/, "");
  for (const entry of entries) {
    if (entry === normalized) return true;
    if (entry.includes("/")) {
      const [network, bits] = entry.split("/");
      const mask = ~((1 << (32 - Number(bits))) - 1) >>> 0;
      const ipNum = ipToInt(normalized);
      const netNum = ipToInt(network);
      if (ipNum !== null && netNum !== null && (ipNum & mask) === (netNum & mask)) return true;
    }
  }
  return false;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

async function requireKioskIp(req: Request, res: Response, next: NextFunction) {
  try {
    const allowedIps = await getSetting<string>("kiosk.allowed_ips", "");
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress || "";
    if (!isIpAllowed(clientIp, allowedIps)) throw new AppError(403, "Kiosk access is not allowed from this network");
    next();
  } catch (err) { next(err); }
}

async function requireKioskPin(req: Request, res: Response, next: NextFunction) {
  try {
    const configuredPin = await getSetting<string>("kiosk.pin", "");
    if (!configuredPin) return next();
    const provided = (req.headers["x-kiosk-pin"] as string) || req.body?.kioskPin;
    if (!provided || provided !== configuredPin)
      throw new AppError(403, "Invalid kiosk PIN"); // ← 401 → 403
    next();
  } catch (err) { next(err); }
}

router.use(requireKioskIp);
router.get("/ping", (_req, res) => res.json({ ok: true }));
router.use(requireKioskPin);

/** Upload selfie from kiosk camera — returns the URL. */
router.post("/upload-selfie", selfieUpload.single("selfie"), (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, "No file uploaded");
    res.json({ url: `/uploads/selfies/${req.file.filename}` });
  } catch (err) { next(err); }
});

/** Look up employee + today's shift + today's attendance + last clock-in. */
router.get("/status/:employeeId", async (req, res, next) => {
  try {
    const emp = await prisma.employee.findUnique({
      where: { employeeId: req.params.employeeId },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        position: true,
        profilePhoto: true,
        employmentStatus: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!emp) throw new AppError(404, "Employee not found");
    if (emp.employmentStatus === "TERMINATED") {
      throw new AppError(403, "Your employment has been terminated. Access is no longer allowed.");
    }

    const now = new Date();
    const dayCutoffHour = await getDayCutoffHour();
    let dateKey = await localCalendarDateOf(now, dayCutoffHour);

    // Early arrival: before the day cutoff (e.g. 6:45 AM with a 7 AM cutoff),
    // localCalendarDateOf returns yesterday. If the employee has an upcoming
    // shift on the real calendar date starting within 1 hour, switch to the
    // real date so the kiosk shows "Not Yet Timed In" instead of yesterday's
    // "Shift complete" and the Time In button becomes available.
    const realDate = await localCalendarDateOf(now, 0);
    if (realDate.getTime() !== dateKey.getTime()) {
      const upcomingAssignment = await prisma.shiftAssignment.findFirst({
        where: { employeeId: emp.id, shift: { date: realDate } },
        include: { shift: true },
      });
      if (upcomingAssignment) {
        const { scheduledStart } = getScheduledTimes(realDate, upcomingAssignment.shift, COMPANY_TZ);
        const msBeforeStart = scheduledStart.getTime() - now.getTime();
        if (msBeforeStart >= 0 && msBeforeStart <= EARLY_CLOCK_IN_WINDOW_MS) {
          dateKey = realDate;
        }
      }
    }

    // Today's attendance — open record takes priority so the Time Out button
    // shows correctly. Multiple records per day are now allowed (multi-shift).
    let attendance = await prisma.attendance.findFirst({
      where: { employeeId: emp.id, date: dateKey, clockOut: null, status: { in: ["PRESENT", "LATE"] } },
      orderBy: { clockIn: "asc" },
    });
    let isFromPrevDay = false;
    if (!attendance) {
      // No open record today — check for graveyard: open record from a previous date.
      const openPrev = await prisma.attendance.findFirst({
        where: {
          employeeId: emp.id,
          clockOut: null,
          status: { in: ["PRESENT", "LATE"] },
          date: { lt: dateKey },
        },
        orderBy: { date: "desc" },
      });
      if (openPrev) {
        attendance = openPrev;
        isFromPrevDay = true;
      } else {
        // All shifts done today — return most recent completed record for display.
        // Exclude ABSENT records: an auto-absent placeholder is not a real clock-in
        // and must not be surfaced as "Timed In" on the kiosk.
        attendance = await prisma.attendance.findFirst({
          where: { employeeId: emp.id, date: dateKey, status: { notIn: ["ABSENT"] } },
          orderBy: { clockIn: "desc" },
        });
      }
    }

    // Find today's shift, or the shift matching the open attendance record's date
    // (covers graveyard employees whose shift date is yesterday).
    const shiftDate = attendance ? attendance.date : dateKey;
    const assignment = await prisma.shiftAssignment.findFirst({
      where: { employeeId: emp.id, shift: { date: shiftDate } },
      include: { shift: { include: { branch: { select: { id: true, name: true } } } } },
      orderBy: { shift: { startTime: "asc" } },
    });

    // Detect stale unclosed record: open record from a previous day whose
    // scheduled shift end has already passed. Surface this so the kiosk can
    // prompt the employee to close it. The employee will clock out at the
    // current time when they press the button — payroll disregards unapproved
    // overtime so inflated hours are not paid regardless of when they close.
    let staleShiftEnd: string | null = null;
    if (isFromPrevDay && attendance && assignment?.shift) {
      const tz = COMPANY_TZ;
      const { scheduledEnd } = getScheduledTimes(attendance.date, assignment.shift, tz);
      if (now > scheduledEnd) {
        staleShiftEnd = scheduledEnd.toISOString();
      }
    }

    // Last clock-in (any completed record before today, for display only)
    const lastAttendance = await prisma.attendance.findFirst({
      where: { employeeId: emp.id, clockOut: { not: null }, date: { lt: dateKey } },
      orderBy: { date: "desc" },
    });

    const formatTime = (d: Date) =>
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" });

    res.json({
      data: {
        employee: {
          id: emp.id, employeeId: emp.employeeId,
          firstName: emp.firstName, lastName: emp.lastName,
          position: emp.position, profilePhoto: emp.profilePhoto,
          branch: emp.branch,
        },
        shift: assignment?.shift
          ? {
              id: assignment.shift.id,
              name: assignment.shift.name,
              startTime: formatTime(assignment.shift.startTime),
              endTime: formatTime(assignment.shift.endTime),
              date: assignment.shift.date.toISOString().slice(0, 10),
              branch: { id: assignment.shift.branch.id, name: assignment.shift.branch.name },
            }
          : null,
        attendance: attendance
          ? { id: attendance.id, clockIn: attendance.clockIn, clockOut: attendance.clockOut, status: attendance.status }
          : null,
        lastClockIn: lastAttendance
          ? {
              date: lastAttendance.date.toISOString().slice(0, 10),
              clockIn: lastAttendance.clockIn,
            }
          : null,
        staleShiftEnd,
      },
    });
  } catch (err) { next(err); }
});

const kioskClockInSchema = z.object({
  employeeId: z.string().trim().min(1),
  selfieIn: z.string().optional(),
  clockInNote: z.string().max(500).optional(),
  kioskPin: z.string().optional(),
});

const kioskClockOutSchema = z.object({
  selfieOut: z.string().optional(),
  clockOut: z.string().datetime({ offset: true }).optional(),
  clockOutNote: z.string().max(500).optional(),
  kioskPin: z.string().optional(),
});

router.get("/validate-pin", (_req, res) => res.json({ ok: true }));

// Validate employee credentials for kiosk usage (called after entering ID)
router.post("/validate-employee", async (req, res, next) => {
  try {
    const { employeeId, password } = req.body as { employeeId?: string; password?: string };
    if (!employeeId || !password) throw new AppError(400, "Missing credentials");
    const emp = await prisma.employee.findUnique({
      where: { employeeId },
      select: {
        id: true,
        employmentStatus: true,
        user: { select: { isActive: true, password: true } },
      },
    });
    if (!emp) throw new AppError(404, "Employee not found");
    if (emp.employmentStatus === "TERMINATED" || emp.user?.isActive === false) {
      throw new AppError(403, "Your employment has been terminated or account is deactivated");
    }
    if (!emp.user) throw new AppError(404, "Employee user not found");
    const ok = await bcrypt.compare(password, emp.user.password);
    if (!ok) throw new AppError(401, "Invalid credentials");
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/clock-in", async (req, res, next) => {
  try {
    const body = kioskClockInSchema.parse(req.body);
    const emp = await prisma.employee.findUnique({
      where: { employeeId: body.employeeId },
      select: { id: true },
    });
    if (!emp) throw new AppError(404, "Employee not found");
    const record = await attendanceService.clockIn({ employeeId: emp.id, selfieIn: body.selfieIn, clockInNote: body.clockInNote });
    res.status(201).json({ data: record });
  } catch (err) { next(err); }
});

router.post("/clock-out/:attendanceId", async (req, res, next) => {
  try {
    const body = kioskClockOutSchema.parse(req.body);
    const record = await attendanceService.clockOut(req.params.attendanceId, {
      selfieOut: body.selfieOut,
      clockOut: body.clockOut,
      clockOutNote: body.clockOutNote,
    });
    res.json({ data: record });
  } catch (err) { next(err); }
});

export default router;
