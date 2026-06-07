import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const amount = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? Number(v) : v))
  .pipe(z.number().min(0).max(10_000_000));

export const deductionTypeEnum = z.enum([
  "LATE",
  "UNPAID_LEAVE",
  "CASH_ADVANCE",
  "SALARY_LOAN",
  "SSS",
  "PHILHEALTH",
  "PAGIBIG",
  "BIR_TAX",
  "OTHER",
]);

export const earningTypeEnum = z.enum([
  "OVERTIME",
  "BONUS",
  "ALLOWANCE",
  "HOLIDAY_PAY",
  "NIGHT_DIFFERENTIAL",
  "PAID_LEAVE",
  "OTHER",
]);

export const createPayrollRunSchema = z
  .object({
    branchId: z.string().uuid(),
    periodStart: isoDate,
    periodEnd: isoDate,
  })
  .refine((v) => new Date(v.periodStart) <= new Date(v.periodEnd), {
    message: "Period end must be on or after period start",
    path: ["periodEnd"],
  });

export const listPayrollRunsQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "PROCESSING", "COMPLETED", "CANCELLED"]).optional(),
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
});

const payslipEarningInput = z.object({
  type: earningTypeEnum,
  label: z.string().min(1).max(100),
  amount: amount,
});

const payslipDeductionInput = z.object({
  type: deductionTypeEnum,
  label: z.string().min(1).max(100),
  amount: amount,
});

/**
 * Adjust a payslip's itemized earnings / deductions. The handler replaces the
 * full list — callers send the complete desired state. All figures are peso
 * amounts (never percentages).
 */
export const adjustPayslipSchema = z.object({
  earnings: z.array(payslipEarningInput).max(50),
  deductions: z.array(payslipDeductionInput).max(50),
  basicPay: amount.optional(),
  remarks: z.string().max(500).optional(),
});

export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type ListPayrollRunsQuery = z.infer<typeof listPayrollRunsQuerySchema>;
export type AdjustPayslipInput = z.infer<typeof adjustPayslipSchema>;
export type PayslipEarningInput = z.infer<typeof payslipEarningInput>;
export type PayslipDeductionInput = z.infer<typeof payslipDeductionInput>;
