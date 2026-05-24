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
});

router.use(authenticate);

// Read-only routes: accessible by both ADMIN and MANAGER
router.get("/", authorize("ADMIN", "MANAGER"), employeeController.list);
router.get("/:id", authorize("ADMIN", "MANAGER"), employeeController.getById);

// Admin-only routes
router.get("/import/template", authorize("ADMIN"), employeeController.csvTemplate);
router.post("/", authorize("ADMIN"), validate(createEmployeeSchema), employeeController.create);
router.post("/import/preview", authorize("ADMIN"), csvUpload.single("file"), employeeController.previewImportCsv);
router.post("/import", authorize("ADMIN"), csvUpload.single("file"), employeeController.importCsv);
router.put("/:id", authorize("ADMIN"), validate(updateEmployeeSchema), employeeController.update);
router.delete("/:id", authorize("ADMIN"), employeeController.deactivate);

// Employee deduction assignments
router.get("/:id/deductions", authorize("ADMIN"), employeeController.listDeductions);
router.post("/:id/deductions", authorize("ADMIN"), employeeController.addDeduction);
router.patch("/:id/deductions/:edId", authorize("ADMIN"), employeeController.updateDeduction);
router.delete("/:id/deductions/:edId", authorize("ADMIN"), employeeController.removeDeduction);

// Employee earning assignments
router.get("/:id/earnings", authorize("ADMIN"), employeeController.listEarnings);
router.post("/:id/earnings", authorize("ADMIN"), employeeController.addEarning);
router.patch("/:id/earnings/:eeId", authorize("ADMIN"), employeeController.updateEarning);
router.delete("/:id/earnings/:eeId", authorize("ADMIN"), employeeController.removeEarning);

// Employee one-time earning assignments
router.get("/:id/one-time-earnings", authorize("ADMIN"), employeeController.listOneTimeEarnings);
router.post("/:id/one-time-earnings", authorize("ADMIN"), employeeController.addOneTimeEarning);
router.patch("/:id/one-time-earnings/:oteId", authorize("ADMIN"), employeeController.updateOneTimeEarning);
router.delete("/:id/one-time-earnings/:oteId", authorize("ADMIN"), employeeController.removeOneTimeEarning);

// Employee documents
router.get("/:id/documents", authorize("ADMIN"), employeeController.listDocuments);
router.post("/:id/documents", authorize("ADMIN"), documentUpload.single("file"), employeeController.uploadDocument);
router.get("/:id/documents/:docId/download", authorize("ADMIN"), employeeController.downloadDocument);
router.get("/:id/documents/:docId/preview", authorize("ADMIN"), employeeController.previewDocument);
router.delete("/:id/documents/:docId", authorize("ADMIN"), employeeController.deleteDocument);

export default router;
