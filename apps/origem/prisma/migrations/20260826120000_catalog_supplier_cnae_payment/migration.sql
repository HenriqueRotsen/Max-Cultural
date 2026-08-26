-- CNAE e dados de pagamento no fornecedor do catálogo
ALTER TABLE "catalog_suppliers" ADD COLUMN IF NOT EXISTS "cnaeCode" TEXT;
ALTER TABLE "catalog_suppliers" ADD COLUMN IF NOT EXISTS "cnaeDescription" TEXT;
ALTER TABLE "catalog_suppliers" ADD COLUMN IF NOT EXISTS "pixKey" TEXT;
ALTER TABLE "catalog_suppliers" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "catalog_suppliers" ADD COLUMN IF NOT EXISTS "bankAgency" TEXT;
ALTER TABLE "catalog_suppliers" ADD COLUMN IF NOT EXISTS "bankAccount" TEXT;
ALTER TABLE "catalog_suppliers" ADD COLUMN IF NOT EXISTS "paymentNotes" TEXT;
