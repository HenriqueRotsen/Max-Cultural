-- Novos tipos de relacionamento + limpeza de legado
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'PROPONENT_PF';
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'PROPONENT_PJ';
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'DIRECTOR_THIRD_SECTOR';
