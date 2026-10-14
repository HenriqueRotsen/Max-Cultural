-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BudgetHierarchyLockLevel" AS ENUM ('FONTE', 'PRODUCT', 'STAGE', 'CITY', 'ITEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "budget_hierarchy_locks" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "level" "BudgetHierarchyLockLevel" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "fonteRecurso" TEXT NOT NULL DEFAULT '',
    "productName" TEXT NOT NULL DEFAULT '',
    "stageName" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "budgetLineId" TEXT,
    "lockedByUserId" TEXT,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "budget_hierarchy_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "budget_hierarchy_locks_sheetId_scopeKey_key"
  ON "budget_hierarchy_locks"("sheetId", "scopeKey");
CREATE INDEX IF NOT EXISTS "budget_hierarchy_locks_sheetId_level_idx"
  ON "budget_hierarchy_locks"("sheetId", "level");
CREATE INDEX IF NOT EXISTS "budget_hierarchy_locks_budgetLineId_idx"
  ON "budget_hierarchy_locks"("budgetLineId");

DO $$ BEGIN
  ALTER TABLE "budget_hierarchy_locks"
    ADD CONSTRAINT "budget_hierarchy_locks_sheetId_fkey"
    FOREIGN KEY ("sheetId") REFERENCES "project_budget_sheets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
