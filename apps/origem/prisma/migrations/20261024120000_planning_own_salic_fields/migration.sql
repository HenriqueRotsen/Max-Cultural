-- Planejamento passa a guardar a própria situação/captação do SALIC
-- (antes lidas do Project da Auditoria via projectId).
ALTER TABLE "planning_projects"
  ADD COLUMN "situacao" TEXT,
  ADD COLUMN "situacaoAt" TIMESTAMP(3),
  ADD COLUMN "valorCaptado" DECIMAL(14,2);

-- Backfill único: preserva os valores atuais antes de cortar o vínculo.
UPDATE "planning_projects" AS pp
SET "situacao" = p."situacao",
    "situacaoAt" = CASE WHEN p."situacao" IS NOT NULL THEN CURRENT_TIMESTAMP END,
    "valorCaptado" = p."valorCaptado"
FROM "Project" AS p
WHERE p."id" = pp."projectId";

-- Fornecedores é alimentado só pelo Planejamento.
ALTER TABLE "catalog_engagements" ALTER COLUMN "source" SET DEFAULT 'PLANNING_MANUAL';
