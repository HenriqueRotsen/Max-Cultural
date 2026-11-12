-- MAX Financeiro: o compromisso (NF/RPA ou pagamento antecipado) diz se o valor
-- é um reembolso. Reembolso não entra na soma do vínculo com o proponente.
ALTER TABLE "rubric_commitments" ADD COLUMN "isReimbursement" BOOLEAN NOT NULL DEFAULT false;
