-- Alertas da Auditoria (antigo Salink): diligência e outros problemas detectados no
-- espelho do SALIC. Tabela do app MAX Auditoria (schema "auditoria"); a pasta de
-- migrations segue no Origem.
CREATE TYPE "auditoria"."AuditAlertStatus" AS ENUM ('NOVO', 'VISTO', 'RESOLVIDO');

CREATE TABLE "auditoria"."audit_alerts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "salicAccountId" TEXT NOT NULL,
    "projectId" TEXT,
    "pronac" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "status" "auditoria"."AuditAlertStatus" NOT NULL DEFAULT 'NOVO',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "seenById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_alerts_workspaceId_status_detectedAt_idx" ON "auditoria"."audit_alerts"("workspaceId", "status", "detectedAt");
CREATE INDEX "audit_alerts_salicAccountId_pronac_type_idx" ON "auditoria"."audit_alerts"("salicAccountId", "pronac", "type");

ALTER TABLE "auditoria"."audit_alerts" ADD CONSTRAINT "audit_alerts_salicAccountId_fkey"
  FOREIGN KEY ("salicAccountId") REFERENCES "origem"."SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auditoria"."audit_alerts" ADD CONSTRAINT "audit_alerts_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "auditoria"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
