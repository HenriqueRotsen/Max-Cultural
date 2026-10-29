-- Sócio do mapa societário gera vínculo art. 23
DO $$ BEGIN
  ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'CORPORATE_MEMBER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
