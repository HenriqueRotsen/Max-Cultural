CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "catalog_services"
  ADD COLUMN IF NOT EXISTS "nameEmbedding" vector(768),
  ADD COLUMN IF NOT EXISTS "descriptionEmbedding" vector(768),
  ADD COLUMN IF NOT EXISTS "embeddingUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "catalog_services_nameEmbedding_cosine_idx"
  ON "catalog_services"
  USING hnsw ("nameEmbedding" vector_cosine_ops);
