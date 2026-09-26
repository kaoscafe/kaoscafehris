-- Allow the same deduction to be assigned to an employee more than once: settled
-- assignments are kept as payment history rather than deleted, and several assignments
-- of one deduction may be collected side by side. No replacement rule is enforced.
DROP INDEX IF EXISTS "employee_deductions_employeeId_deductionId_key";

-- Link a payslip deduction line back to the assignment it was charged from, so
-- payoff tracking credits/reverses the exact assignment instead of matching by name
-- (which is ambiguous once an employee has repeat assignments of the same deduction).
ALTER TABLE "payslip_deductions" ADD COLUMN "employeeDeductionId" TEXT;
