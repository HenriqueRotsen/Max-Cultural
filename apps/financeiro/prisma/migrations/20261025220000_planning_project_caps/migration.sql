-- Planejamento: limites próprios do projeto (no lugar da IN) — fornecedor, vínculo
-- (proponente + vinculados) e excesso permitido na rubrica. A IN vira informativa.
ALTER TABLE "planning_projects" ALTER COLUMN "rulesetVersion" DROP NOT NULL;
ALTER TABLE "planning_projects"
  ADD COLUMN "supplierCapPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
  ADD COLUMN "bondCapPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
  ADD COLUMN "rubricOverrunPct" DECIMAL(6,2) NOT NULL DEFAULT 100;
