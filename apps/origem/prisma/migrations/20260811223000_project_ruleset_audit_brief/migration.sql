-- AlterEnum RelatedPartyRelation
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'COMPANION';
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'LINEAL_KIN';
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'COLLATERAL_2ND';
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'AFFINITY';

-- AlterEnum RulesetStatus
ALTER TYPE "RulesetStatus" ADD VALUE IF NOT EXISTS 'archived';

-- CreateEnum RulesetSource
DO $$ BEGIN
  CREATE TYPE "RulesetSource" AS ENUM ('ai', 'manual', 'default');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ComplianceRuleset enrich
ALTER TABLE "ComplianceRuleset" ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3);
ALTER TABLE "ComplianceRuleset" ADD COLUMN IF NOT EXISTS "legalSummary" TEXT;
ALTER TABLE "ComplianceRuleset" ADD COLUMN IF NOT EXISTS "jurisprudenceNotes" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ComplianceRuleset_version_key" ON "ComplianceRuleset"("version");
CREATE INDEX IF NOT EXISTS "ComplianceRuleset_effectiveFrom_idx" ON "ComplianceRuleset"("effectiveFrom");

-- Project ruleset + audit brief
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "complianceRulesetId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "rulesetSource" "RulesetSource";
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "rulesetChosenAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "rulesetRationale" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "rulesetLocked" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "auditBrief" JSONB;

CREATE INDEX IF NOT EXISTS "Project_complianceRulesetId_idx" ON "Project"("complianceRulesetId");

DO $$ BEGIN
  ALTER TABLE "Project"
    ADD CONSTRAINT "Project_complianceRulesetId_fkey"
    FOREIGN KEY ("complianceRulesetId") REFERENCES "ComplianceRuleset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- WatchedSupplier relation
ALTER TABLE "WatchedSupplier" ADD COLUMN IF NOT EXISTS "relation" "RelatedPartyRelation";
