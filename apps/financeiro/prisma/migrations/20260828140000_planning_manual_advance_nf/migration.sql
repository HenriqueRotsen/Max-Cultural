-- AlterEnum
ALTER TYPE "AppNotificationType" ADD VALUE IF NOT EXISTS 'NF_PENDING';

-- AlterTable
ALTER TABLE "rubric_commitments" ADD COLUMN IF NOT EXISTS "nfPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rubric_commitments" ADD COLUMN IF NOT EXISTS "paidWithoutNf" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

-- AlterTable
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "nfPending" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "nfPendingDaysAfterPaid" INTEGER NOT NULL DEFAULT 7;

CREATE INDEX IF NOT EXISTS "planning_documents_contentHash_idx" ON "planning_documents"("workspaceId", "contentHash");
