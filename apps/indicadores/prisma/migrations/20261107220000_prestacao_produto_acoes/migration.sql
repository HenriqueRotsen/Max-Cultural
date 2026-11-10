-- Produto passa a ser ligado às ações (na aba "Produtos e metas"), não a cada ficha.
ALTER TABLE "prestacao_produtos" ADD COLUMN "acao_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Leva o que já estava escolhido nas fichas para o produto (ação no produto mais usado nas fichas dela).
WITH escolha AS (
  SELECT DISTINCT ON (g."acao_id") g."acao_id", f."produto_id"
  FROM "prestacao_fichas" f
  JOIN "acao_agendas" g ON g."id" = f."agenda_id"
  WHERE f."produto_id" IS NOT NULL
  GROUP BY g."acao_id", f."produto_id"
  ORDER BY g."acao_id", COUNT(*) DESC
)
UPDATE "prestacao_produtos" p
SET "acao_ids" = sub.ids
FROM (SELECT "produto_id", array_agg("acao_id") AS ids FROM escolha GROUP BY "produto_id") sub
WHERE p."id" = sub."produto_id";
