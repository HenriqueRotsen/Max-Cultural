-- Contato e endereço passam de SalicAccount para AppUser
ALTER TABLE "AppUser" ADD COLUMN "contactEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppUser" ADD COLUMN "contactPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppUser" ADD COLUMN "addressZip" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppUser" ADD COLUMN "addressStreet" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppUser" ADD COLUMN "addressNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppUser" ADD COLUMN "addressComplement" TEXT;
ALTER TABLE "AppUser" ADD COLUMN "addressNeighborhood" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppUser" ADD COLUMN "addressCity" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppUser" ADD COLUMN "addressState" TEXT NOT NULL DEFAULT '';

ALTER TABLE "SalicAccount" DROP COLUMN "contactEmail";
ALTER TABLE "SalicAccount" DROP COLUMN "contactPhone";
ALTER TABLE "SalicAccount" DROP COLUMN "addressZip";
ALTER TABLE "SalicAccount" DROP COLUMN "addressStreet";
ALTER TABLE "SalicAccount" DROP COLUMN "addressNumber";
ALTER TABLE "SalicAccount" DROP COLUMN "addressComplement";
ALTER TABLE "SalicAccount" DROP COLUMN "addressNeighborhood";
ALTER TABLE "SalicAccount" DROP COLUMN "addressCity";
ALTER TABLE "SalicAccount" DROP COLUMN "addressState";
