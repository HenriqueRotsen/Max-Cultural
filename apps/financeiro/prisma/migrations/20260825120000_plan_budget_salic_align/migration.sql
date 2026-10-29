-- Alinha orçamento do Planejamento à hierarquia SALIC:
-- Fonte → Produto → Etapa → UF/Município → Item (Dias, Qtde, Ocorrência, Vl.Unitário).
-- Remove a camada inventada plan_budget_rubrics.

-- Produto: código oficial SALIC
ALTER TABLE "plan_products" ADD COLUMN IF NOT EXISTS "salicCodigo" INTEGER;

-- Etapa: idPlanilhaEtapa
ALTER TABLE "plan_budget_stages" ADD COLUMN IF NOT EXISTS "salicEtapaId" INTEGER;

-- Linha: campos SALIC + vínculo direto à etapa
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "stageId" TEXT;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "days" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "occurrences" DECIMAL(14,4) NOT NULL DEFAULT 1;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "justification" TEXT;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "isAdministrative" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "isProponent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "fonteRecurso" TEXT NOT NULL DEFAULT 'Incentivo Fiscal Federal';
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "salicItemId" INTEGER;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "salicUnidadeId" INTEGER;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "salicFonteId" INTEGER;
ALTER TABLE "plan_budget_items" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- Migrar itens de rubrica → etapa (e flags)
UPDATE "plan_budget_items" AS i
SET
  "stageId" = r."stageId",
  "isAdministrative" = COALESCE(r."isAdministrative", false),
  "isProponent" = COALESCE(r."isProponent", false)
FROM "plan_budget_rubrics" AS r
WHERE i."rubricId" = r.id
  AND (i."stageId" IS NULL OR i."stageId" = '');

-- Remover itens órfãos (sem etapa resolvida)
DELETE FROM "plan_budget_items" WHERE "stageId" IS NULL OR "stageId" = '';

-- Trocar FK rubric → stage
ALTER TABLE "plan_budget_items" DROP CONSTRAINT IF EXISTS "plan_budget_items_rubricId_fkey";
DROP INDEX IF EXISTS "plan_budget_items_rubricId_idx";
ALTER TABLE "plan_budget_items" DROP COLUMN IF EXISTS "rubricId";

ALTER TABLE "plan_budget_items" ALTER COLUMN "stageId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "plan_budget_items_stageId_idx" ON "plan_budget_items"("stageId");
CREATE INDEX IF NOT EXISTS "plan_budget_items_productId_idx" ON "plan_budget_items"("productId");

ALTER TABLE "plan_budget_items"
  ADD CONSTRAINT "plan_budget_items_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "plan_budget_stages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Unidade padrão alinhada ao SALIC
ALTER TABLE "plan_budget_items" ALTER COLUMN "unit" SET DEFAULT 'Unidade';

DROP TABLE IF EXISTS "plan_budget_rubrics";
