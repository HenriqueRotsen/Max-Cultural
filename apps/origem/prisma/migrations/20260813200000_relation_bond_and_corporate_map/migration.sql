-- Workspace: overrides de vínculo art. 23 por IN
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "relationBondOverrides" JSONB;

-- Precisão de datas + papel societário
DO $$ BEGIN
  CREATE TYPE "DatePrecision" AS ENUM ('DAY', 'MONTH', 'YEAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CorporateRole" AS ENUM ('PARTNER', 'ADMINISTRATOR', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Supplier: data de abertura
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "foundedAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "foundedAtPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY';
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "foundedAtSource" TEXT;

-- Mapa societário por fornecedor
CREATE TABLE IF NOT EXISTS "CorporateMember" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cgccpf" TEXT NOT NULL DEFAULT '',
  "role" "CorporateRole" NOT NULL DEFAULT 'PARTNER',
  "sharePct" DECIMAL(7,4),
  "validFrom" TIMESTAMP(3),
  "validFromPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
  "validTo" TIMESTAMP(3),
  "validToPrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
  "source" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorporateMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CorporateChange" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL,
  "changePrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorporateChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CorporateMember_supplierId_idx" ON "CorporateMember"("supplierId");
CREATE INDEX IF NOT EXISTS "CorporateMember_cgccpf_idx" ON "CorporateMember"("cgccpf");
CREATE INDEX IF NOT EXISTS "CorporateChange_supplierId_idx" ON "CorporateChange"("supplierId");
CREATE INDEX IF NOT EXISTS "CorporateChange_changedAt_idx" ON "CorporateChange"("changedAt");

DO $$ BEGIN
  ALTER TABLE "CorporateMember"
    ADD CONSTRAINT "CorporateMember_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CorporateChange"
    ADD CONSTRAINT "CorporateChange_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
