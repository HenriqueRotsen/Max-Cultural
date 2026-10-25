-- Novo fluxo do Planejamento: readequada automática (com cópia da planilha anterior),
-- encerramento manual, avaliação do fornecedor após o pagamento e novos avisos.
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'READEQUADA_APPLIED';
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'EVALUATION_PENDING';

ALTER TABLE "planning_projects"
  ADD COLUMN "sheetSearchActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "readequadaAppliedAt" TIMESTAMP(3),
  ADD COLUMN "readequadaNoticeSeenAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" TEXT,
  ADD COLUMN "closeReason" TEXT;

ALTER TABLE "catalog_engagements"
  ADD COLUMN "evaluatedAt" TIMESTAMP(3),
  ADD COLUMN "evaluatedById" TEXT;

ALTER TABLE "notification_settings"
  ADD COLUMN "readequadaApplied" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "evaluationPending" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "project_budget_sheet_versions" (
    "id" TEXT NOT NULL,
    "planningProjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalApproved" DECIMAL(14,2) NOT NULL,
    "linesJson" JSONB NOT NULL,

    CONSTRAINT "project_budget_sheet_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_budget_sheet_versions_planningProjectId_kind_idx" ON "project_budget_sheet_versions"("planningProjectId", "kind");

ALTER TABLE "project_budget_sheet_versions" ADD CONSTRAINT "project_budget_sheet_versions_planningProjectId_fkey"
  FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
