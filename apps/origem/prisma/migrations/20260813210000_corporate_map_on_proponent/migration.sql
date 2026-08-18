-- Mapa societário: de Supplier → SalicAccount (proponente)

-- Limpa dados do modelo anterior (fornecedor) — ainda não era o escopo correto
DELETE FROM "CorporateChange";
DELETE FROM "CorporateMember";

ALTER TABLE "CorporateMember" DROP CONSTRAINT IF EXISTS "CorporateMember_supplierId_fkey";
ALTER TABLE "CorporateChange" DROP CONSTRAINT IF EXISTS "CorporateChange_supplierId_fkey";

DROP INDEX IF EXISTS "CorporateMember_supplierId_idx";
DROP INDEX IF EXISTS "CorporateChange_supplierId_idx";

ALTER TABLE "CorporateMember" RENAME COLUMN "supplierId" TO "salicAccountId";
ALTER TABLE "CorporateChange" RENAME COLUMN "supplierId" TO "salicAccountId";

CREATE INDEX IF NOT EXISTS "CorporateMember_salicAccountId_idx" ON "CorporateMember"("salicAccountId");
CREATE INDEX IF NOT EXISTS "CorporateChange_salicAccountId_idx" ON "CorporateChange"("salicAccountId");

ALTER TABLE "CorporateMember"
  ADD CONSTRAINT "CorporateMember_salicAccountId_fkey"
  FOREIGN KEY ("salicAccountId") REFERENCES "SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorporateChange"
  ADD CONSTRAINT "CorporateChange_salicAccountId_fkey"
  FOREIGN KEY ("salicAccountId") REFERENCES "SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Campos de abertura no proponente
ALTER TABLE "SalicAccount" ADD COLUMN IF NOT EXISTS "foundedAt" TIMESTAMP(3);
ALTER TABLE "SalicAccount" ADD COLUMN IF NOT EXISTS "foundedAtPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY';
ALTER TABLE "SalicAccount" ADD COLUMN IF NOT EXISTS "foundedAtSource" TEXT;

-- Remove do fornecedor
ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "foundedAt";
ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "foundedAtPrecision";
ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "foundedAtSource";
