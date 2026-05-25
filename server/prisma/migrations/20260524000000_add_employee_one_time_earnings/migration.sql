-- CreateTable
CREATE TABLE "employee_one_time_earnings" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "EarningType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payroll_run_id" TEXT,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_one_time_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_one_time_earnings_employee_id_idx" ON "employee_one_time_earnings"("employee_id");

-- CreateIndex
CREATE INDEX "employee_one_time_earnings_payroll_run_id_idx" ON "employee_one_time_earnings"("payroll_run_id");

-- AddForeignKey
ALTER TABLE "employee_one_time_earnings" ADD CONSTRAINT "employee_one_time_earnings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_one_time_earnings" ADD CONSTRAINT "employee_one_time_earnings_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
