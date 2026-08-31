-- Pacote SALIC: comprovante só ou NF/RPA + comprovante merged em 1 PDF.

ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "salicComprovanteId" TEXT;
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "salicPublishedAt" TIMESTAMP(3);
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "salicPublishMode" TEXT;
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "salicMergedStoragePath" TEXT;
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "salicRepublishPending" BOOLEAN NOT NULL DEFAULT false;
