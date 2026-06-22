import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  changePasswordSchema,
  updateProfileSchema,
} from "./portal.schema.js";
import * as portalController from "./portal.controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsBase = process.env.UPLOADS_DIR ?? path.join(__dirname, "..", "..", "..", "uploads");

const photosDir = path.join(uploadsBase, "photos");
fs.mkdirSync(photosDir, { recursive: true });

const documentsDir = path.join(uploadsBase, "documents");
fs.mkdirSync(documentsDir, { recursive: true });

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: photosDir,
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

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: documentsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExts = /\.(jpe?g|png|gif|webp|bmp|pdf)$/i;
    const allowedMimes = /^image\/(jpeg|png|gif|webp|bmp)$|^application\/pdf$/;
    const ext = path.extname(file.originalname);
    if (!allowedExts.test(ext) || !allowedMimes.test(file.mimetype)) {
      cb(new Error("Unsupported file type. Accepted formats: JPG, PNG, GIF, WebP, BMP, PDF."));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.use(authenticate);

router.get("/profile", portalController.getProfile);
router.put("/profile", validate(updateProfileSchema), portalController.updateProfile);
router.post("/profile/photo", photoUpload.single("photo"), portalController.uploadPhoto);
router.put("/password", validate(changePasswordSchema), portalController.changePassword);
router.get("/schedule", portalController.getSchedule);
router.get("/attendance", portalController.getAttendance);

// Employee self-service documents — upload only.
// Viewing/listing and deleting are intentionally not exposed: uploaded
// documents are managed by HR/Admin via the employees module.
router.post("/documents", documentUpload.single("file"), portalController.uploadMyDocument);

export default router;
