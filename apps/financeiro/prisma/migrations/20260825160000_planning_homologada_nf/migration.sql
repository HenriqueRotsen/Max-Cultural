-- Pivot Planejamento: remove rascunho Plan*; add planilha homologada + NF commitments

DROP TABLE IF EXISTS "plan_budget_items" CASCADE;
DROP TABLE IF EXISTS "plan_budget_stages" CASCADE;
DROP TABLE IF EXISTS "plan_crew_members" CASCADE;
DROP TABLE IF EXISTS "plan_venues" CASCADE;
DROP TABLE IF EXISTS "plan_schedule_items" CASCADE;
DROP TABLE IF EXISTS "plan_products" CASCADE;
DROP TABLE IF EXISTS "plan_identifications" CASCADE;
DROP TABLE IF EXISTS "plan_proposals" CASCADE;

DROP TYPE IF EXISTS "PlanProposalStatus";

CREATE TYPE "CommitmentStatus" AS ENUM ('RESERVED', 'PAID', 'CANCELLED');
CREATE TYPE "PlanningDocumentKind" AS ENUM ('NF', 'PAYMENT_PROOF', 'TAX_PROOF');
CREATE TYPE "PlanningDocumentStatus" AS ENUM ('PROCESSING', 'REVIEW', 'IMPORTED', 'FAILED');
CREATE TYPE "AppNotificationType" AS ENUM ('PAYMENT_DUE_SOON', 'PAYMENT_OVERDUE', 'RUBRIC_NEAR');

ALTER TABLE "catalog_engagements" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'AUDIT';
ALTER TABLE "catalog_engagements" ADD COLUMN IF NOT EXISTS "planningProjectId" TEXT;
ALTER TABLE "catalog_engagements" ADD COLUMN IF NOT EXISTS "budgetLineId" TEXT;

CREATE TABLE "planning_projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "externalCode" TEXT NOT NULL,
    "name" TEXT,
    "projectId" TEXT,
    "importedAt" TIMESTAMP(3),
    "importSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "planning_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planning_projects_projectId_key" ON "planning_projects"("projectId");
CREATE UNIQUE INDEX "planning_projects_workspaceId_accountId_externalCode_key" ON "planning_projects"("workspaceId", "accountId", "externalCode");
CREATE INDEX "planning_projects_workspaceId_updatedAt_idx" ON "planning_projects"("workspaceId", "updatedAt");
CREATE INDEX "planning_projects_jurisdiction_idx" ON "planning_projects"("jurisdiction");

CREATE TABLE "project_budget_sheets" (
    "id" TEXT NOT NULL,
    "planningProjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'HOMOLOGADA',
    "totalApproved" DECIMAL(14,2) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,
    "sourceFilename" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "project_budget_sheets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_budget_sheets_planningProjectId_key" ON "project_budget_sheets"("planningProjectId");

CREATE TABLE "project_budget_lines" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "planilhaAprovacaoId" TEXT,
    "fonteRecurso" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "itemName" TEXT NOT NULL,
    "categoryHint" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'Unidade',
    "days" INTEGER NOT NULL DEFAULT 1,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "occurrences" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approvedAmount" DECIMAL(14,2) NOT NULL,
    "salicComprovado" DECIMAL(14,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_budget_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_budget_lines_sheetId_idx" ON "project_budget_lines"("sheetId");
CREATE INDEX "project_budget_lines_planilhaAprovacaoId_idx" ON "project_budget_lines"("planilhaAprovacaoId");
CREATE INDEX "project_budget_lines_categoryHint_idx" ON "project_budget_lines"("categoryHint");
CREATE INDEX "project_budget_lines_itemName_idx" ON "project_budget_lines"("itemName");

CREATE TABLE "rubric_commitments" (
    "id" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "planningProjectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'RESERVED',
    "hasBond" BOOLEAN NOT NULL DEFAULT false,
    "expectedPayAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rubric_commitments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rubric_commitments_engagementId_key" ON "rubric_commitments"("engagementId");
CREATE INDEX "rubric_commitments_budgetLineId_idx" ON "rubric_commitments"("budgetLineId");
CREATE INDEX "rubric_commitments_planningProjectId_idx" ON "rubric_commitments"("planningProjectId");
CREATE INDEX "rubric_commitments_workspaceId_status_idx" ON "rubric_commitments"("workspaceId", "status");
CREATE INDEX "rubric_commitments_expectedPayAt_idx" ON "rubric_commitments"("expectedPayAt");

CREATE TABLE "planning_documents" (
    "id" TEXT NOT NULL,
    "kind" "PlanningDocumentKind" NOT NULL,
    "status" "PlanningDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "originalByteSize" INTEGER,
    "extractedJson" JSONB,
    "errorMessage" TEXT,
    "workspaceId" TEXT NOT NULL,
    "planningProjectId" TEXT,
    "engagementId" TEXT,
    "commitmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "planning_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "planning_documents_workspaceId_kind_idx" ON "planning_documents"("workspaceId", "kind");
CREATE INDEX "planning_documents_commitmentId_idx" ON "planning_documents"("commitmentId");
CREATE INDEX "planning_documents_engagementId_idx" ON "planning_documents"("engagementId");

CREATE TABLE "app_notifications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "AppNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_notifications_workspaceId_createdAt_idx" ON "app_notifications"("workspaceId", "createdAt");
CREATE INDEX "app_notifications_userId_readAt_idx" ON "app_notifications"("userId", "readAt");

ALTER TABLE "planning_projects" ADD CONSTRAINT "planning_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_projects" ADD CONSTRAINT "planning_projects_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_projects" ADD CONSTRAINT "planning_projects_rulesetVersion_fkey" FOREIGN KEY ("rulesetVersion") REFERENCES "ComplianceRuleset"("version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_projects" ADD CONSTRAINT "planning_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_budget_sheets" ADD CONSTRAINT "project_budget_sheets_planningProjectId_fkey" FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "project_budget_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rubric_commitments" ADD CONSTRAINT "rubric_commitments_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "project_budget_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rubric_commitments" ADD CONSTRAINT "rubric_commitments_planningProjectId_fkey" FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rubric_commitments" ADD CONSTRAINT "rubric_commitments_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "catalog_engagements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "planning_documents" ADD CONSTRAINT "planning_documents_planningProjectId_fkey" FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planning_documents" ADD CONSTRAINT "planning_documents_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "catalog_engagements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planning_documents" ADD CONSTRAINT "planning_documents_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "rubric_commitments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_engagements" ADD CONSTRAINT "catalog_engagements_planningProjectId_fkey" FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_engagements" ADD CONSTRAINT "catalog_engagements_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "project_budget_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "catalog_engagements_planningProjectId_idx" ON "catalog_engagements"("planningProjectId");
CREATE INDEX IF NOT EXISTS "catalog_engagements_budgetLineId_idx" ON "catalog_engagements"("budgetLineId");
