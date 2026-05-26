import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { loginSchema } from "./auth.schema.js";
import * as authController from "./auth.controller.js";

const router = Router();

// Brute-force guard: 20 attempts per IP per 15 min.
// skipSuccessfulRequests = only FAILED attempts count toward the limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
});

router.post("/login", loginLimiter, validate(loginSchema), authController.login);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);

export default router;