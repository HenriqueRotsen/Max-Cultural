-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "situacao" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lifecycleStatus" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO';

-- AlterTable
ALTER TABLE "planning_projects" ADD COLUMN IF NOT EXISTS "lifecycleStatus" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO';
ALTER TABLE "planning_projects" ADD COLUMN IF NOT EXISTS "salicPublishStatus" TEXT NOT NULL DEFAULT 'IDLE';
ALTER TABLE "planning_projects" ADD COLUMN IF NOT EXISTS "salicPublishMessage" TEXT;
ALTER TABLE "planning_projects" ADD COLUMN IF NOT EXISTS "salicPublishStartedAt" TIMESTAMP(3);
ALTER TABLE "planning_projects" ADD COLUMN IF NOT EXISTS "salicPublishCancelRequested" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_lifecycleStatus_idx" ON "Project"("lifecycleStatus");
CREATE INDEX IF NOT EXISTS "planning_projects_lifecycleStatus_idx" ON "planning_projects"("lifecycleStatus");
