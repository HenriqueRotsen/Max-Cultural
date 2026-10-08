-- AlterTable Oficina: modalidades online e/ou presencial
ALTER TABLE "oficinas" ADD COLUMN IF NOT EXISTS "oferece_online" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "oficinas" ADD COLUMN IF NOT EXISTS "oferece_presencial" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable OficinaTerritorio
CREATE TABLE IF NOT EXISTS "oficina_territorios" (
    "id" TEXT NOT NULL,
    "oficina_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oficina_territorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable OficinaTerritorioAlias
CREATE TABLE IF NOT EXISTS "oficina_territorio_aliases" (
    "id" TEXT NOT NULL,
    "oficina_id" TEXT NOT NULL,
    "raw_normalized" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "oficina_territorio_id" TEXT,
    "cidade" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT '',
    "territorio" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oficina_territorio_aliases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "oficina_territorios_oficina_id_ordem_idx" ON "oficina_territorios"("oficina_id", "ordem");
CREATE INDEX IF NOT EXISTS "oficina_territorios_cidade_estado_idx" ON "oficina_territorios"("cidade", "estado");
CREATE UNIQUE INDEX IF NOT EXISTS "oficina_territorio_aliases_oficina_id_raw_normalized_key" ON "oficina_territorio_aliases"("oficina_id", "raw_normalized");
CREATE INDEX IF NOT EXISTS "oficina_territorio_aliases_oficina_id_idx" ON "oficina_territorio_aliases"("oficina_id");

DO $$ BEGIN
  ALTER TABLE "oficina_territorios" ADD CONSTRAINT "oficina_territorios_oficina_id_fkey"
    FOREIGN KEY ("oficina_id") REFERENCES "oficinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "oficina_territorio_aliases" ADD CONSTRAINT "oficina_territorio_aliases_oficina_id_fkey"
    FOREIGN KEY ("oficina_id") REFERENCES "oficinas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "oficina_territorio_aliases" ADD CONSTRAINT "oficina_territorio_aliases_oficina_territorio_id_fkey"
    FOREIGN KEY ("oficina_territorio_id") REFERENCES "oficina_territorios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum FormularioCampoTipo
ALTER TYPE "FormularioCampoTipo" ADD VALUE IF NOT EXISTS 'TERRITORIO_OFICINA';
