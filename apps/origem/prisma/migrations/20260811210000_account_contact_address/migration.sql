-- Contato e endereço do proponente (obrigatórios em novas contas; legado com default vazio)
ALTER TABLE "SalicAccount" ADD COLUMN "contactEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalicAccount" ADD COLUMN "contactPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalicAccount" ADD COLUMN "addressZip" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalicAccount" ADD COLUMN "addressStreet" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalicAccount" ADD COLUMN "addressNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalicAccount" ADD COLUMN "addressComplement" TEXT;
ALTER TABLE "SalicAccount" ADD COLUMN "addressNeighborhood" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalicAccount" ADD COLUMN "addressCity" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalicAccount" ADD COLUMN "addressState" TEXT NOT NULL DEFAULT '';
