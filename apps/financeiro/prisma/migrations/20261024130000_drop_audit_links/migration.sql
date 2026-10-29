-- Corta os vínculos de dados entre a Auditoria (espelho do SALIC) e os demais módulos.
-- Rodar depois do deploy do código que não usa mais estas colunas e da limpeza do Fornecedores.
ALTER TABLE "planning_projects" DROP CONSTRAINT IF EXISTS "planning_projects_projectId_fkey";
DROP INDEX IF EXISTS "planning_projects_projectId_key";
ALTER TABLE "planning_projects" DROP COLUMN IF EXISTS "projectId";

DROP INDEX IF EXISTS "catalog_engagements_salicPaymentId_key";
ALTER TABLE "catalog_engagements" DROP COLUMN IF EXISTS "salicPaymentId";

ALTER TABLE "catalog_suppliers" DROP COLUMN IF EXISTS "fromAudit";
