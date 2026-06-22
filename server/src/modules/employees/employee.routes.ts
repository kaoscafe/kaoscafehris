import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { authenticate, authorize } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createEmployeeSchema, updateEmployeeSchema } from "./employee.schema.js";
import * as employeeController from "./employee.controller.js";

const router = Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

const uploadsBase = process.env.UPLOADS_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "uploads");
const documentsDir = path.join(uploadsBase, "documents");
fs.mkdirSync(documentsDir, { recursive: true });

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

router.use(authenticate);

// Read-only routes: accessible by both ADMIN and MANAGER
router.get("/", authorize("ADMIN", "MANAGER"), employeeController.list);
router.get("/:id", authorize("ADMIN", "MANAGER"), employeeController.getById);

// Admin-only management routes.
// Managers have read-only access to employees (see GET routes above) and may
// only add deductions and upload documents — see the exceptions below.
router.get("/import/template", authorize("ADMIN"), employeeController.csvTemplate);
router.post("/", authorize("ADMIN"), validate(createEmployeeSchema), employeeController.create);
router.post("/import/preview", authorize("ADMIN"), csvUpload.single("file"), employeeController.previewImportCsv);
router.post("/import", authorize("ADMIN"), csvUpload.single("file"), employeeController.importCsv);
router.put("/:id", authorize("ADMIN"), validate(updateEmployeeSchema), employeeController.update);
// DELETE now performs permanent (hard) delete — admin only
router.delete("/:id", authorize("ADMIN"), employeeController.remove);

// Employee deduction assignments — managers may view, ADD, and EDIT, but only admins may remove.
router.get("/:id/deductions", authorize("ADMIN", "MANAGER"), employeeController.listDeductions);
router.post("/:id/deductions", authorize("ADMIN", "MANAGER"), employeeController.addDeduction);
router.patch("/:id/deductions/:edId", authorize("ADMIN", "MANAGER"), employeeController.updateDeduction);
router.delete("/:id/deductions/:edId", authorize("ADMIN"), employeeController.removeDeduction);

// Employee earning assignments — managers may view, but only admins may modify.
router.get("/:id/earnings", authorize("ADMIN", "MANAGER"), employeeController.listEarnings);
router.post("/:id/earnings", authorize("ADMIN"), employeeController.addEarning);
router.patch("/:id/earnings/:eeId", authorize("ADMIN"), employeeController.updateEarning);
router.delete("/:id/earnings/:eeId", authorize("ADMIN"), employeeController.removeEarning);

// Employee one-time earning assignments — managers may view, but only admins may modify.
router.get("/:id/one-time-earnings", authorize("ADMIN", "MANAGER"), employeeController.listOneTimeEarnings);
router.post("/:id/one-time-earnings", authorize("ADMIN"), employeeController.addOneTimeEarning);
router.patch("/:id/one-time-earnings/:oteId", authorize("ADMIN"), employeeController.updateOneTimeEarning);
router.delete("/:id/one-time-earnings/:oteId", authorize("ADMIN"), employeeController.removeOneTimeEarning);

// Employee documents — managers may ONLY upload; viewing, downloading, and deleting are admin-only.
router.get("/:id/documents", authorize("ADMIN"), employeeController.listDocuments);
router.post("/:id/documents", authorize("ADMIN", "MANAGER"), documentUpload.single("file"), employeeController.uploadDocument);
router.get("/:id/documents/:docId/download", authorize("ADMIN"), employeeController.downloadDocument);
router.get("/:id/documents/:docId/preview", authorize("ADMIN"), employeeController.previewDocument);
router.delete("/:id/documents/:docId", authorize("ADMIN"), employeeController.deleteDocument);

export default router;
