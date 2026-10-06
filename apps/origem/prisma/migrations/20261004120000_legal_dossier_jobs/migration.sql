-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LegalDossierJobStatus" AS ENUM ('pending', 'running', 'success', 'error', 'replaced');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "legal_dossier_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "LegalDossierJobStatus" NOT NULL DEFAULT 'pending',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "progressMsg" TEXT,
    "storagePrefix" TEXT NOT NULL,
    "zipPath" TEXT,
    "manifestJson" JSONB,
    "errorMessage" TEXT,
    "workState" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_dossier_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_dossier_jobs_workspaceId_status_idx" ON "legal_dossier_jobs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_dossier_jobs_accountId_createdAt_idx" ON "legal_dossier_jobs"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_dossier_jobs_status_idx" ON "legal_dossier_jobs"("status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "legal_dossier_jobs" ADD CONSTRAINT "legal_dossier_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "legal_dossier_jobs" ADD CONSTRAINT "legal_dossier_jobs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
