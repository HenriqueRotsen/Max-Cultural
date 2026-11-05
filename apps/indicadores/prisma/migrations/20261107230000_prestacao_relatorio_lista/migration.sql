-- Relatório guarda se saiu com a lista nominal de participantes.
ALTER TABLE "prestacao_relatorios" ADD COLUMN "lista_nominal" BOOLEAN NOT NULL DEFAULT false;
