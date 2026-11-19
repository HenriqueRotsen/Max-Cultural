-- MAX Auditoria: patrocinadores de cada projeto (captação da API pública do SALIC).
ALTER TABLE "auditoria"."Project" ADD COLUMN "sponsorsSyncedAt" TIMESTAMP(3);

CREATE TABLE "auditoria"."ProjectSponsorship" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "cgccpf" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectSponsorship_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectSponsorship_projectId_idx" ON "auditoria"."ProjectSponsorship"("projectId");
CREATE INDEX "ProjectSponsorship_cgccpf_idx" ON "auditoria"."ProjectSponsorship"("cgccpf");

ALTER TABLE "auditoria"."ProjectSponsorship"
  ADD CONSTRAINT "ProjectSponsorship_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "auditoria"."Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
