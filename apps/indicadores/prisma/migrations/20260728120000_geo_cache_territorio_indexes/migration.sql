-- CreateIndex
CREATE INDEX IF NOT EXISTS "inscricoes_estado_idx" ON "inscricoes"("Estado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inscricoes_cidade_idx" ON "inscricoes"("Cidade");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inscricoes_territorio_idx" ON "inscricoes"("Territorio");

-- CreateTable
CREATE TABLE IF NOT EXISTS "geo_cache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geo_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "geo_cache_key_key" ON "geo_cache"("key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "geo_cache_estado_idx" ON "geo_cache"("estado");
