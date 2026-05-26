import path from "node:path";
import { createRequire } from "module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

const require = createRequire(import.meta.url);
const archiver = require("archiver");

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

// Static uploads (selfie photos, etc.)
app.use("/uploads", express.static(uploadsDir));

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

// TEMPORARY MIGRATION ROUTE - REMOVE AFTER MIGRATION
app.get("/temp-download-uploads", (_req, res) => {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=uploads.zip");

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err: Error) => res.status(500).send(err.message));
  archive.pipe(res);
  archive.directory(uploadsDir, false);
  archive.finalize();
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
