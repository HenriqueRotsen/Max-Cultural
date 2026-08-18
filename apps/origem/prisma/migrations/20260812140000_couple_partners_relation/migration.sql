-- Novos tipos societários entre empresas + nota no relacionamento
ALTER TYPE "RelatedPartyRelation" ADD VALUE IF NOT EXISTS 'COUPLE_PARTNERS';

ALTER TABLE "RelatedParty" ADD COLUMN IF NOT EXISTS "notes" TEXT;
