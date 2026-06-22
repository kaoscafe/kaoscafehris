import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { dateRangeQuerySchema } from "./portal.schema.js";
import * as portalService from "./portal.service.js";
import * as docService from "../employees/employee-document.service.js";

export async function uploadPhoto(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    if (!req.file) throw new AppError(400, "No file uploaded");
    const url = `/uploads/photos/${req.file.filename}`;
    const data = await portalService.updateProfilePhoto(userId, url);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

function requireUser(req: Request): { userId: string } {
  if (!req.user) throw new AppError(401, "Authentication required");
  return { userId: req.user.userId };
}

export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const data = await portalService.getProfile(userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const data = await portalService.updateProfile(userId, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    await portalService.changePassword(userId, req.body);
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

export async function getSchedule(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const query = dateRangeQuerySchema.parse(req.query);
    const data = await portalService.getSchedule(userId, query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getAttendance(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const query = dateRangeQuerySchema.parse(req.query);
    const data = await portalService.getAttendanceHistory(userId, query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// --- My Documents -----------------------------------------------------------
// Self-service is upload-only. Viewing/listing, downloading, previewing, and
// deleting are intentionally not exposed — uploaded documents are managed by
// the Admin via the employees module.

export async function uploadMyDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    if (!req.file) throw new AppError(400, "No file uploaded");
    const employeeId = await portalService.resolveEmployeeIdOrThrow(userId);
    const name = (req.body.name as string) || req.file.originalname;
    const data = await docService.createEmployeeDocument(employeeId, req.file, name);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}
