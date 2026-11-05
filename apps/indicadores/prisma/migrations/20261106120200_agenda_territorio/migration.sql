-- A agenda usa os territórios cadastrados na ação (zona, cidade, UF) ou "online".
ALTER TABLE "acao_agendas" ADD COLUMN IF NOT EXISTS "territorio_id" TEXT;
ALTER TABLE "acao_agendas" ADD COLUMN IF NOT EXISTS "online" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE "acao_agendas" ADD CONSTRAINT "acao_agendas_territorio_id_fkey"
    FOREIGN KEY ("territorio_id") REFERENCES "acao_territorios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "acao_agendas_territorio_id_idx" ON "acao_agendas"("territorio_id");
