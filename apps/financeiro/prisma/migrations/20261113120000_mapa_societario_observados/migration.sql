-- MAX Auditoria: mapa societário também para os observados (empresas que a
-- auditoria acompanha). O intervalo pertence a um proponente OU a um observado.

ALTER TABLE "auditoria"."CorporatePeriod" ALTER COLUMN "salicAccountId" DROP NOT NULL;
ALTER TABLE "auditoria"."CorporatePeriod" ADD COLUMN "watchedSupplierId" TEXT;

ALTER TABLE "auditoria"."CorporatePeriod"
  ADD CONSTRAINT "CorporatePeriod_watchedSupplierId_fkey"
  FOREIGN KEY ("watchedSupplierId") REFERENCES "auditoria"."WatchedSupplier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CorporatePeriod_watchedSupplierId_idx"
  ON "auditoria"."CorporatePeriod"("watchedSupplierId");

-- Exatamente um dono: proponente ou observado.
ALTER TABLE "auditoria"."CorporatePeriod"
  ADD CONSTRAINT "CorporatePeriod_one_owner"
  CHECK (("salicAccountId" IS NULL) <> ("watchedSupplierId" IS NULL));

-- Data de abertura do observado (Receita), para validar os intervalos.
ALTER TABLE "auditoria"."WatchedSupplier" ADD COLUMN "foundedAt" TIMESTAMP(3);

-- Data de entrada do sócio informada pela Receita.
ALTER TABLE "auditoria"."CorporatePeriodMember" ADD COLUMN "joinedAt" TIMESTAMP(3);
