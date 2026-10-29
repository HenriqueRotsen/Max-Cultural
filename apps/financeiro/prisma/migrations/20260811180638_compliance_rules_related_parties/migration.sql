-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('PJ', 'PF', 'MEI');

-- CreateEnum
CREATE TYPE "RelatedPartyRelation" AS ENUM ('SPOUSE', 'PARTNER', 'AFFILIATED_COMPANY', 'COMMON_PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "RulesetStatus" AS ENUM ('active', 'draft', 'superseded');

-- AlterTable
ALTER TABLE "SalicAccount" ADD COLUMN     "personType" "PersonType" NOT NULL DEFAULT 'PJ';

-- CreateTable
CREATE TABLE "RelatedParty" (
    "id" TEXT NOT NULL,
    "cgccpf" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" "RelatedPartyRelation" NOT NULL DEFAULT 'OTHER',
    "countsTowardProponentCap" BOOLEAN NOT NULL DEFAULT true,
    "artisticGroupException" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "salicAccountId" TEXT NOT NULL,

    CONSTRAINT "RelatedParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRuleset" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "caps" JSONB NOT NULL,
    "contentHash" TEXT,
    "status" "RulesetStatus" NOT NULL DEFAULT 'draft',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRuleset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormDocumentSnapshot" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "contentHash" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "NormDocumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelatedParty_cgccpf_idx" ON "RelatedParty"("cgccpf");

-- CreateIndex
CREATE UNIQUE INDEX "RelatedParty_salicAccountId_cgccpf_key" ON "RelatedParty"("salicAccountId", "cgccpf");

-- CreateIndex
CREATE INDEX "ComplianceRuleset_status_idx" ON "ComplianceRuleset"("status");

-- CreateIndex
CREATE INDEX "ComplianceRuleset_createdAt_idx" ON "ComplianceRuleset"("createdAt");

-- CreateIndex
CREATE INDEX "NormDocumentSnapshot_contentHash_idx" ON "NormDocumentSnapshot"("contentHash");

-- CreateIndex
CREATE INDEX "NormDocumentSnapshot_fetchedAt_idx" ON "NormDocumentSnapshot"("fetchedAt");

-- AddForeignKey
ALTER TABLE "RelatedParty" ADD CONSTRAINT "RelatedParty_salicAccountId_fkey" FOREIGN KEY ("salicAccountId") REFERENCES "SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
