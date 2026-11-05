-- Pré-definição: cada tarefa tem um prazo (D±N) relativo a uma data:
-- início/fim da execução do projeto (nível 1) ou início/fim da execução da ação (nível 2).
ALTER TYPE "PrazoBase" RENAME VALUE 'DATA_ACAO' TO 'INICIO_ACAO';
ALTER TYPE "PrazoBase" ADD VALUE IF NOT EXISTS 'FIM_ACAO';

-- Cada realização da ação tem início (coluna "data") e fim; sem fim = um dia só.
ALTER TABLE "acao_agendas" ADD COLUMN IF NOT EXISTS "data_fim" TIMESTAMP(3);

-- Cópia da pré-definição por projeto: mudanças só valem para projetos novos.
ALTER TABLE "acompanhamentos" ADD COLUMN IF NOT EXISTS "modelos" JSONB;
ALTER TABLE "acompanhamentos" ADD COLUMN IF NOT EXISTS "modelos_em" TIMESTAMP(3);

