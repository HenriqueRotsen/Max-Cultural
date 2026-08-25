-- CreateEnum
CREATE TYPE "RulesetKind" AS ENUM ('AUDIT_CAPS', 'PLANNING', 'BOTH');

-- CreateEnum
CREATE TYPE "PlanProposalStatus" AS ENUM ('draft', 'ready', 'exported', 'submitted');

-- AlterTable ComplianceRuleset
ALTER TABLE "ComplianceRuleset" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT NOT NULL DEFAULT 'FEDERAL';
ALTER TABLE "ComplianceRuleset" ADD COLUMN IF NOT EXISTS "kind" "RulesetKind" NOT NULL DEFAULT 'BOTH';
ALTER TABLE "ComplianceRuleset" ADD COLUMN IF NOT EXISTS "planning" JSONB;

CREATE INDEX IF NOT EXISTS "ComplianceRuleset_jurisdiction_idx" ON "ComplianceRuleset"("jurisdiction");
CREATE INDEX IF NOT EXISTS "ComplianceRuleset_kind_idx" ON "ComplianceRuleset"("kind");

-- PlanProposal
CREATE TABLE "plan_proposals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT,
    "title" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "enquadramento" TEXT NOT NULL,
    "segmento" TEXT NOT NULL,
    "status" "PlanProposalStatus" NOT NULL DEFAULT 'draft',
    "identificationValid" BOOLEAN NOT NULL DEFAULT false,
    "distributionValid" BOOLEAN NOT NULL DEFAULT false,
    "executionValid" BOOLEAN NOT NULL DEFAULT false,
    "budgetValid" BOOLEAN NOT NULL DEFAULT false,
    "admissibilityBrief" JSONB,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_identifications" (
    "proposalId" TEXT NOT NULL,
    "resumo" TEXT NOT NULL DEFAULT '',
    "justificativa" TEXT NOT NULL DEFAULT '',
    "objetivos" TEXT NOT NULL DEFAULT '',
    "extras" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_identifications_pkey" PRIMARY KEY ("proposalId")
);

CREATE TABLE "plan_products" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "channelQty" JSONB NOT NULL DEFAULT '{}',
    "ticketPrice" DECIMAL(14,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_schedule_items" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "productId" TEXT,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_schedule_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_venues" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "address" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_venues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_crew_members" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_crew_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_budget_stages" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_budget_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_budget_rubrics" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "isAdministrative" BOOLEAN NOT NULL DEFAULT false,
    "isProponent" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_budget_rubrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plan_budget_items" (
    "id" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "catalogServiceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_budget_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plan_proposals_workspaceId_updatedAt_idx" ON "plan_proposals"("workspaceId", "updatedAt");
CREATE INDEX "plan_proposals_jurisdiction_idx" ON "plan_proposals"("jurisdiction");
CREATE INDEX "plan_proposals_status_idx" ON "plan_proposals"("status");
CREATE INDEX "plan_products_proposalId_idx" ON "plan_products"("proposalId");
CREATE INDEX "plan_schedule_items_proposalId_idx" ON "plan_schedule_items"("proposalId");
CREATE INDEX "plan_venues_proposalId_idx" ON "plan_venues"("proposalId");
CREATE INDEX "plan_crew_members_proposalId_idx" ON "plan_crew_members"("proposalId");
CREATE INDEX "plan_budget_stages_proposalId_idx" ON "plan_budget_stages"("proposalId");
CREATE INDEX "plan_budget_rubrics_stageId_idx" ON "plan_budget_rubrics"("stageId");
CREATE INDEX "plan_budget_items_rubricId_idx" ON "plan_budget_items"("rubricId");

ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SalicAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_rulesetVersion_fkey" FOREIGN KEY ("rulesetVersion") REFERENCES "ComplianceRuleset"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "plan_identifications" ADD CONSTRAINT "plan_identifications_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "plan_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_products" ADD CONSTRAINT "plan_products_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "plan_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_schedule_items" ADD CONSTRAINT "plan_schedule_items_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "plan_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_schedule_items" ADD CONSTRAINT "plan_schedule_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "plan_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_venues" ADD CONSTRAINT "plan_venues_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "plan_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_crew_members" ADD CONSTRAINT "plan_crew_members_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "plan_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_budget_stages" ADD CONSTRAINT "plan_budget_stages_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "plan_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_budget_rubrics" ADD CONSTRAINT "plan_budget_rubrics_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "plan_budget_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_budget_items" ADD CONSTRAINT "plan_budget_items_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "plan_budget_rubrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_budget_items" ADD CONSTRAINT "plan_budget_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "plan_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
