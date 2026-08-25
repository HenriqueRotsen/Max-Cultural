-- Valor homologado original para teto 2× na redistribuição de rubricas
ALTER TABLE "project_budget_lines" ADD COLUMN IF NOT EXISTS "homologatedAmount" DECIMAL(14,2);

UPDATE "project_budget_lines"
SET "homologatedAmount" = "approvedAmount"
WHERE "homologatedAmount" IS NULL;

ALTER TABLE "project_budget_lines" ALTER COLUMN "homologatedAmount" SET NOT NULL;
