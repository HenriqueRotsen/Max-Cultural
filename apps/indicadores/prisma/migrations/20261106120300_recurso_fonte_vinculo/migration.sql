-- Recurso liberado: de onde veio (Financeiro ou gestão) e vínculo manual com o Financeiro
-- (projetos de outras leis, sem PRONAC).
ALTER TABLE "acompanhamentos" ADD COLUMN IF NOT EXISTS "recurso_fonte" TEXT;
ALTER TABLE "acompanhamentos" ADD COLUMN IF NOT EXISTS "financeiro_manual" BOOLEAN NOT NULL DEFAULT false;
UPDATE "acompanhamentos" SET "recurso_fonte" = 'FINANCEIRO' WHERE "recurso_liberado_em" IS NOT NULL AND "recurso_fonte" IS NULL;
