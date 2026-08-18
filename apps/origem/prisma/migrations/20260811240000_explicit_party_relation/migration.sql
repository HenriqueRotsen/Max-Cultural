-- Migra relation solto de WatchedSupplier → RelatedParty (aresta A↔B)
-- só quando o workspace tem exatamente 1 conta (lado A inequívoco).
INSERT INTO "RelatedParty" (
  "id",
  "cgccpf",
  "name",
  "relation",
  "countsTowardProponentCap",
  "artisticGroupException",
  "createdAt",
  "updatedAt",
  "salicAccountId"
)
SELECT
  md5(random()::text || clock_timestamp()::text || w."id")::text,
  regexp_replace(COALESCE(w."cgccpf", s."cgccpf"), '[^0-9]', '', 'g'),
  COALESCE(NULLIF(w."nameQuery", ''), NULLIF(w."label", ''), s."name", w."cgccpf", 'Relacionado'),
  w."relation",
  true,
  false,
  NOW(),
  NOW(),
  a."id"
FROM "WatchedSupplier" w
JOIN "SalicAccount" a ON a."workspaceId" = w."workspaceId"
LEFT JOIN "Supplier" s ON s."id" = w."supplierId"
WHERE w."relation" IS NOT NULL
  AND regexp_replace(COALESCE(w."cgccpf", s."cgccpf", ''), '[^0-9]', '', 'g') <> ''
  AND (
    SELECT COUNT(*)::int
    FROM "SalicAccount" a2
    WHERE a2."workspaceId" = w."workspaceId"
  ) = 1
ON CONFLICT ("salicAccountId", "cgccpf") DO UPDATE SET
  "relation" = EXCLUDED."relation",
  "name" = CASE
    WHEN "RelatedParty"."name" IS NULL OR "RelatedParty"."name" = '' THEN EXCLUDED."name"
    ELSE "RelatedParty"."name"
  END,
  "updatedAt" = NOW();

-- Observados deixam de carregar tipo de vínculo
ALTER TABLE "WatchedSupplier" DROP COLUMN IF EXISTS "relation";
