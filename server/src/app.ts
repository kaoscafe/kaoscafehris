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

app.set("trust proxy", 1);

// Global middleware
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(auditContextMiddleware);

// Selfies are served publicly — filenames are random UUIDs (unguessable).
// Required by the kiosk which has no JWT token.
app.use("/uploads/selfies", express.static(path.join(uploadsDir, "selfies")));

// Documents are served via authenticated API routes in employee.routes.ts
// (/api/employees/:id/documents/:docId/download|preview) — NOT exposed here.

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
