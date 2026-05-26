import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import * as authService from "./auth.service.js";

const COOKIE_NAME = "token";

function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // fallback: 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: parseDurationToMs(env.jwtExpiresIn), // always in sync with JWT_EXPIRES_IN
  };
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, user } = await authService.login(req.body);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
  res.json({ message: "Logged out" });
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required");
    }
    const user = await authService.getCurrentUser(req.user.userId);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
