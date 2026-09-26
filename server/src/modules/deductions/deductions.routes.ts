import { Router } from "express";
import { z } from "zod";
import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import { authenticate, authorize } from "../../middleware/auth.js";

const router = Router();
router.use(authenticate);

const GOV_TYPES = ["SSS", "PHILHEALTH", "PAGIBIG", "BIR_TAX"] as const;

const deductionSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  amount: z.coerce.number().nonnegative("Amount must be 0 or greater"),
  type: z.enum(GOV_TYPES).optional().nullable(),
});

router.get("/", async (_req, res, next) => {
  try {
    const deductions = await prisma.deduction.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ data: deductions.map((d) => ({ ...d, amount: Number(d.amount) })) });
  } catch (err) { next(err); }
});

router.post("/", authorize("ADMIN"), async (req, res, next) => {
  try {
    const body = deductionSchema.parse(req.body);
    const deduction = await prisma.deduction.create({ data: body });
    res.status(201).json({ data: { ...deduction, amount: Number(deduction.amount) } });
  } catch (err) { next(err); }
});

router.patch("/:id", authorize("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = deductionSchema.partial().parse(req.body);
    const existing = await prisma.deduction.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "Deduction not found");
    const updated = await prisma.deduction.update({ where: { id }, data: body });
    res.json({ data: { ...updated, amount: Number(updated.amount) } });
  } catch (err) { next(err); }
});

router.delete("/:id", authorize("ADMIN"), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.deduction.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, "Deduction not found");

    // Deleting the definition cascades to every assignment, including settled ones
    // kept as payment history, so refuse while any employee still holds it.
    const assignedCount = await prisma.employeeDeduction.count({ where: { deductionId: id } });
    if (assignedCount > 0) {
      throw new AppError(
        409,
        `"${existing.name}" is assigned to ${assignedCount} employee record${
          assignedCount === 1 ? "" : "s"
        }, including settled ones kept as history. Remove those assignments first.`
      );
    }

    await prisma.deduction.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
