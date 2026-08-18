-- Novas opções de vínculo A↔B (UI) + mantém OTHER só como legado
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'COLLATERAL_3RD';
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'PROPONENT';
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'SAME_ADDRESS';
