-- Documentos de apoio do lançamento (boleto, fatura, recibo, contrato, apólice,
-- orçamento): ficam no lançamento e entram no PDF enviado ao SALIC.
ALTER TYPE "PlanningDocumentKind" ADD VALUE IF NOT EXISTS 'SUPPORT';
ALTER TABLE "planning_documents" ADD COLUMN "supportType" TEXT;
