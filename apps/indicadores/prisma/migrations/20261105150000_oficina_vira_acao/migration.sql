-- Contexto → Projeto → Ação: a oficina passa a ser um tipo de ação.
-- Só renomeia (nenhum dado é apagado); toda ação existente fica com o tipo "oficina".

-- Tipos de ação (editáveis pela gestão)
CREATE TABLE IF NOT EXISTS "acao_tipos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acao_tipos_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "acao_tipos" ENABLE ROW LEVEL SECURITY;

INSERT INTO "acao_tipos" ("id", "nome", "ordem") VALUES
  ('oficina', 'Oficina', 1),
  ('apresentacao', 'Apresentação/Espetáculo', 2),
  ('exposicao', 'Exposição', 3),
  ('evento', 'Evento/Festival', 4),
  ('curso', 'Curso', 5),
  ('palestra', 'Palestra/Roda de conversa', 6),
  ('outro', 'Outro', 99)
ON CONFLICT ("id") DO NOTHING;

-- oficinas → acoes
ALTER TABLE "oficinas" RENAME TO "acoes";
ALTER TABLE "acoes" ADD COLUMN "tipo_id" TEXT NOT NULL DEFAULT 'oficina';
ALTER TABLE "acoes" ADD CONSTRAINT "acoes_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "acao_tipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "acoes_tipo_id_idx" ON "acoes"("tipo_id");

-- oficina_territorios → acao_territorios
ALTER TABLE "oficina_territorios" RENAME TO "acao_territorios";
ALTER TABLE "acao_territorios" RENAME COLUMN "oficina_id" TO "acao_id";

-- oficina_territorio_aliases → acao_territorio_aliases
ALTER TABLE "oficina_territorio_aliases" RENAME TO "acao_territorio_aliases";
ALTER TABLE "acao_territorio_aliases" RENAME COLUMN "oficina_id" TO "acao_id";
ALTER TABLE "acao_territorio_aliases" RENAME COLUMN "oficina_territorio_id" TO "acao_territorio_id";

-- oficina_professores → acao_responsaveis
ALTER TABLE "oficina_professores" RENAME TO "acao_responsaveis";
ALTER TABLE "acao_responsaveis" RENAME COLUMN "oficina_id" TO "acao_id";

-- formularios.oficina_id → acao_id
ALTER TABLE "formularios" RENAME COLUMN "oficina_id" TO "acao_id";

-- Escopo de acesso e tipo de campo de formulário
ALTER TYPE "DataScopeKind" RENAME VALUE 'OFICINA' TO 'ACAO';
ALTER TYPE "FormularioCampoTipo" RENAME VALUE 'TERRITORIO_OFICINA' TO 'TERRITORIO_ACAO';

-- Nomes de chaves, restrições e índices acompanham as tabelas novas
ALTER TABLE "acao_tipos" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "acoes" RENAME CONSTRAINT "oficinas_pkey" TO "acoes_pkey";
ALTER TABLE "acoes" RENAME CONSTRAINT "oficinas_projetoId_fkey" TO "acoes_projetoId_fkey";
ALTER TABLE "acao_territorios" RENAME CONSTRAINT "oficina_territorios_pkey" TO "acao_territorios_pkey";
ALTER TABLE "acao_territorios" RENAME CONSTRAINT "oficina_territorios_oficina_id_fkey" TO "acao_territorios_acao_id_fkey";
ALTER TABLE "acao_territorio_aliases" RENAME CONSTRAINT "oficina_territorio_aliases_pkey" TO "acao_territorio_aliases_pkey";
ALTER TABLE "acao_territorio_aliases" RENAME CONSTRAINT "oficina_territorio_aliases_oficina_id_fkey" TO "acao_territorio_aliases_acao_id_fkey";
ALTER TABLE "acao_territorio_aliases" RENAME CONSTRAINT "oficina_territorio_aliases_oficina_territorio_id_fkey" TO "acao_territorio_aliases_acao_territorio_id_fkey";
ALTER TABLE "acao_responsaveis" RENAME CONSTRAINT "oficina_professores_pkey" TO "acao_responsaveis_pkey";
ALTER TABLE "acao_responsaveis" RENAME CONSTRAINT "oficina_professores_user_id_fkey" TO "acao_responsaveis_user_id_fkey";
ALTER INDEX "oficinas_projetoId_idx" RENAME TO "acoes_projetoId_idx";
ALTER INDEX "oficina_territorios_oficina_id_ordem_idx" RENAME TO "acao_territorios_acao_id_ordem_idx";
ALTER INDEX "oficina_territorios_cidade_estado_idx" RENAME TO "acao_territorios_cidade_estado_idx";
ALTER INDEX "oficina_territorio_aliases_oficina_id_idx" RENAME TO "acao_territorio_aliases_acao_id_idx";
ALTER INDEX "oficina_territorio_aliases_oficina_id_raw_normalized_key" RENAME TO "acao_territorio_aliases_acao_id_raw_normalized_key";
ALTER INDEX "oficina_professores_oficina_id_idx" RENAME TO "acao_responsaveis_acao_id_idx";
ALTER INDEX "oficina_professores_oficina_id_user_id_key" RENAME TO "acao_responsaveis_acao_id_user_id_key";
ALTER INDEX "oficina_professores_user_id_idx" RENAME TO "acao_responsaveis_user_id_idx";
ALTER INDEX "formularios_oficina_id_idx" RENAME TO "formularios_acao_id_idx";

-- Histórico de auditoria acompanha os nomes novos (oficina.created → acao.created)
UPDATE "audit_logs" SET "action" = 'acao.' || substr("action", length('oficina.') + 1) WHERE "action" LIKE 'oficina.%';
UPDATE "audit_logs" SET "entityType" = 'acao' WHERE "entityType" = 'oficina';
UPDATE "audit_logs" SET "entityType" = 'Acao' WHERE "entityType" = 'Oficina';

-- Modelos e configurações de formulário guardam o tipo de campo em JSON.
UPDATE "formulario_modelos" SET "campos" = replace("campos"::text, '"TERRITORIO_OFICINA"', '"TERRITORIO_ACAO"')::jsonb WHERE "campos"::text LIKE '%"TERRITORIO_OFICINA"%';
