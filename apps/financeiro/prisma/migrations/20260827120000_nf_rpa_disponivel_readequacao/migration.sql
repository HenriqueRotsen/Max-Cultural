-- AlterEnum
ALTER TYPE "PlanningDocumentKind" ADD VALUE IF NOT EXISTS 'RPA';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReadequacaoDraftSource" AS ENUM ('MANUAL', 'SALIC_READEQUADA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReadequacaoDraftStatus" AS ENUM ('OPEN', 'EXPORTED', 'APPLIED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- PlanningProject captura fields
ALTER TABLE "planning_projects" ADD COLUMN IF NOT EXISTS "captadoRecebido" DECIMAL(14,2);
ALTER TABLE "planning_projects" ADD COLUMN IF NOT EXISTS "captadoTransferido" DECIMAL(14,2);
ALTER TABLE "planning_projects" ADD COLUMN IF NOT EXISTS "rendimentos" DECIMAL(14,2);

-- RubricCommitment allocation share
ALTER TABLE "rubric_commitments" ADD COLUMN IF NOT EXISTS "allocationSharePct" DECIMAL(7,4);

-- PlanningDocument fiscal fields
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "personType" TEXT;
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "grossAmount" DECIMAL(14,2);
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "netAmount" DECIMAL(14,2);
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "taxTotal" DECIMAL(14,2);
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "taxesJson" JSONB;

-- DocumentRubricAllocation
CREATE TABLE IF NOT EXISTS "document_rubric_allocations" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "sharePct" DECIMAL(7,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "taxesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_rubric_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_rubric_allocations_documentId_budgetLineId_key"
  ON "document_rubric_allocations"("documentId", "budgetLineId");
CREATE INDEX IF NOT EXISTS "document_rubric_allocations_commitmentId_idx"
  ON "document_rubric_allocations"("commitmentId");

DO $$ BEGIN
  ALTER TABLE "document_rubric_allocations"
    ADD CONSTRAINT "document_rubric_allocations_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "planning_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "document_rubric_allocations"
    ADD CONSTRAINT "document_rubric_allocations_budgetLineId_fkey"
    FOREIGN KEY ("budgetLineId") REFERENCES "project_budget_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "document_rubric_allocations"
    ADD CONSTRAINT "document_rubric_allocations_commitmentId_fkey"
    FOREIGN KEY ("commitmentId") REFERENCES "rubric_commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- PlanningReadequacaoDraft
CREATE TABLE IF NOT EXISTS "planning_readequacao_drafts" (
    "id" TEXT NOT NULL,
    "planningProjectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "source" "ReadequacaoDraftSource" NOT NULL DEFAULT 'MANUAL',
    "status" "ReadequacaoDraftStatus" NOT NULL DEFAULT 'OPEN',
    "snapshotJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_readequacao_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "planning_readequacao_drafts_planningProjectId_status_idx"
  ON "planning_readequacao_drafts"("planningProjectId", "status");
CREATE INDEX IF NOT EXISTS "planning_readequacao_drafts_workspaceId_expiresAt_idx"
  ON "planning_readequacao_drafts"("workspaceId", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "planning_readequacao_drafts"
    ADD CONSTRAINT "planning_readequacao_drafts_planningProjectId_fkey"
    FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "planning_readequacao_drafts"
    ADD CONSTRAINT "planning_readequacao_drafts_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
