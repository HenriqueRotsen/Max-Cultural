-- Link comprovante → NF/RPA de origem (rateio espelhado)
ALTER TABLE "planning_documents" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT;

DO $$ BEGIN
  ALTER TABLE "planning_documents"
    ADD CONSTRAINT "planning_documents_sourceDocumentId_fkey"
    FOREIGN KEY ("sourceDocumentId") REFERENCES "planning_documents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "planning_documents_sourceDocumentId_idx"
  ON "planning_documents"("sourceDocumentId");
