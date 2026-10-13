-- Link each branch to the Branch Manager account that manages it. A manager may be
-- assigned to several branches and can add/edit employees in all of them.

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "managerId" TEXT;

-- CreateIndex
CREATE INDEX "branches_managerId_idx" ON "branches"("managerId");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link the existing free-text "branchManager" names to manager accounts. A name links
-- when it matches exactly one non-terminated MANAGER-role employee, as "first last" or
-- "first middle last" (case-insensitive, extra spaces ignored). Linked branches drop the
-- free-text name; unmatched ones keep it so an admin can pick the manager by hand.
WITH candidates AS (
  SELECT b."id" AS branch_id, e."id" AS employee_id
  FROM "branches" b
  JOIN "employees" e ON TRUE
  JOIN "users" u ON u."id" = e."userId"
  WHERE b."branchManager" IS NOT NULL
    AND u."role" = 'MANAGER'
    AND e."employmentStatus" <> 'TERMINATED'
    AND lower(regexp_replace(trim(b."branchManager"), '\s+', ' ', 'g')) IN (
      lower(regexp_replace(trim(concat_ws(' ', e."firstName", e."lastName")), '\s+', ' ', 'g')),
      lower(regexp_replace(trim(concat_ws(' ', e."firstName", e."middleName", e."lastName")), '\s+', ' ', 'g'))
    )
),
unique_matches AS (
  SELECT branch_id, min(employee_id) AS employee_id
  FROM candidates
  GROUP BY branch_id
  HAVING count(DISTINCT employee_id) = 1
)
UPDATE "branches" b
SET "managerId" = m.employee_id, "branchManager" = NULL
FROM unique_matches m
WHERE b."id" = m.branch_id;
