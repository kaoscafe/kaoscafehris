-- AlterTable: add effective pay-rate snapshots to payslips
ALTER TABLE "payslips"
  ADD COLUMN "effectivePayType" "PayType",
  ADD COLUMN "effectiveBasicSalary" DECIMAL(12,2),
  ADD COLUMN "effectiveHourlyRate" DECIMAL(12,4);
