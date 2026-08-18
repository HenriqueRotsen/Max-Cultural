-- Mapa societário por intervalos: períodos com sócios PF/PJ

DROP TABLE IF EXISTS "CorporatePeriodMember";
DROP TABLE IF EXISTS "CorporatePeriod";
DROP TABLE IF EXISTS "CorporateChange";
DROP TABLE IF EXISTS "CorporateMember";

CREATE TABLE "CorporatePeriod" (
  "id" TEXT NOT NULL,
  "salicAccountId" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validFromPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
  "validTo" TIMESTAMP(3),
  "validToPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
  "label" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorporatePeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CorporatePeriodMember" (
  "id" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cgccpf" TEXT NOT NULL DEFAULT '',
  "personType" "PersonType" NOT NULL DEFAULT 'PF',
  "role" "CorporateRole" NOT NULL DEFAULT 'PARTNER',
  "sharePct" DECIMAL(7,4),
  "source" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorporatePeriodMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CorporatePeriod_salicAccountId_idx" ON "CorporatePeriod"("salicAccountId");
CREATE INDEX "CorporatePeriod_validFrom_idx" ON "CorporatePeriod"("validFrom");
CREATE INDEX "CorporatePeriodMember_periodId_idx" ON "CorporatePeriodMember"("periodId");
CREATE INDEX "CorporatePeriodMember_cgccpf_idx" ON "CorporatePeriodMember"("cgccpf");

ALTER TABLE "CorporatePeriod"
  ADD CONSTRAINT "CorporatePeriod_salicAccountId_fkey"
  FOREIGN KEY ("salicAccountId") REFERENCES "SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CorporatePeriodMember"
  ADD CONSTRAINT "CorporatePeriodMember_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "CorporatePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
