-- OSC: mapa institucional (denominações sem sócio/societário)
ALTER TABLE "SalicAccount" ADD COLUMN IF NOT EXISTS "institutionalMap" BOOLEAN NOT NULL DEFAULT false;
