ALTER TABLE "catalog_suppliers" ADD COLUMN "fromAudit" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "catalog_engagements" ADD COLUMN "salicPaymentId" TEXT;

CREATE UNIQUE INDEX "catalog_engagements_salicPaymentId_key" ON "catalog_engagements"("salicPaymentId");
