import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { auditContextMiddleware } from "./lib/audit-context.js";
import router from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_DIR ?? path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();

// Railway uses multiple reverse proxies — trust all of them so
// express-rate-limit reads the real client IP from X-Forwarded-For.
app.set("trust proxy", true);

// Global middleware
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(auditContextMiddleware);

// Selfies are served publicly — filenames are random UUIDs (unguessable).
app.use("/uploads/selfies", express.static(path.join(uploadsDir, "selfies")));

// API routes
app.use("/api", router);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// In production the server serves the built React client
if (env.isProd) {
  const clientDist = path.join(__dirname, "..", "..", "client", "dist");
  app.use(express.static(clientDist));
  app.use((_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Error handler (must be last)
app.use(errorHandler);

export default app;