-- Atualização automática com o SALIC: sempre ligada por padrão; só quem tem a
-- capacidade "auditoria.atualizacao.desativar" desliga (com confirmação dupla).
ALTER TABLE "Workspace"
  ADD COLUMN "salicAutoSync" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "salicAutoSyncChangedAt" TIMESTAMP(3),
  ADD COLUMN "salicAutoSyncChangedById" TEXT,
  ADD COLUMN "salicAutoSyncNote" TEXT;
