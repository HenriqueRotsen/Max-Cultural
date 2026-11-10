-- MAX Auditoria: o vínculo com o proponente passa a valer por PRONAC (o mapa
-- societário e as relações pessoais mudam durante o projeto), e cada
-- pagamento pode ser marcado como "conta / não conta" para o vínculo.

-- 1) Vínculo por PRONAC
CREATE TABLE "auditoria"."ProjectObservadoBond" (
    "id" TEXT NOT NULL,
    "cgccpf" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ProjectObservadoBond_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectObservadoBond_projectId_cgccpf_key"
  ON "auditoria"."ProjectObservadoBond"("projectId", "cgccpf");
CREATE INDEX "ProjectObservadoBond_workspaceId_idx" ON "auditoria"."ProjectObservadoBond"("workspaceId");
CREATE INDEX "ProjectObservadoBond_cgccpf_idx" ON "auditoria"."ProjectObservadoBond"("cgccpf");

ALTER TABLE "auditoria"."ProjectObservadoBond"
  ADD CONSTRAINT "ProjectObservadoBond_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "financeiro"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auditoria"."ProjectObservadoBond"
  ADD CONSTRAINT "ProjectObservadoBond_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "auditoria"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Os vínculos de hoje (proponente × IN) passam para cada PRONAC em que já valiam.
-- A tabela antiga "ObservadoBond" fica intacta (histórico); o app deixa de lê-la.
INSERT INTO "auditoria"."ProjectObservadoBond" (
  "id", "cgccpf", "enabled", "createdAt", "updatedAt", "workspaceId", "projectId"
)
SELECT
  md5('pob:' || p."id" || ':' || b."cgccpf"),
  b."cgccpf",
  b."enabled",
  b."createdAt",
  NOW(),
  b."workspaceId",
  p."id"
FROM "auditoria"."ObservadoBond" b
JOIN "auditoria"."Project" p ON p."salicAccountId" = b."salicAccountId"
LEFT JOIN "financeiro"."ComplianceRuleset" r ON r."id" = p."complianceRulesetId"
WHERE r."version" = b."rulesetVersion"
   OR (
     p."complianceRulesetId" IS NULL
     AND b."rulesetVersion" IN (
       SELECT "version" FROM "financeiro"."ComplianceRuleset" WHERE "status" = 'active' AND "deletedAt" IS NULL
     )
   )
ON CONFLICT ("projectId", "cgccpf") DO NOTHING;

-- 2) Pagamento conta / não conta para o vínculo (null = automático: alimentação e refeição não contam)
ALTER TABLE "auditoria"."Payment" ADD COLUMN "countsForBond" BOOLEAN;
