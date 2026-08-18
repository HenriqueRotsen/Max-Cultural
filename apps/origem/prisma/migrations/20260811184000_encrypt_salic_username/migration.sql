-- Rename: login passa a ser tratado como segredo criptografado (AES-256-GCM),
-- no mesmo padrão de salicPasswordEnc. Valores legados em texto puro são
-- recriptografados na próxima gravação / script de migração.
ALTER TABLE "SalicAccount" RENAME COLUMN "salicUsername" TO "salicUsernameEnc";
