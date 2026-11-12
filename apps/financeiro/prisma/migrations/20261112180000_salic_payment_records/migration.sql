-- MAX Financeiro: cada pagamento da relação do SALIC, para as pendências do
-- projeto (pago no SALIC sem lançamento no sistema / excluído no SALIC).
CREATE TABLE "salic_payment_records" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planningProjectId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "planilhaAprovacaoId" TEXT,
    "budgetLineId" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierDoc" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentDate" TEXT,
    "proofNumber" TEXT,
    "rubricItem" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "linkedProofId" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "salic_payment_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salic_payment_records_planningProjectId_externalId_key"
  ON "salic_payment_records"("planningProjectId", "externalId");
CREATE INDEX "salic_payment_records_workspaceId_idx" ON "salic_payment_records"("workspaceId");

ALTER TABLE "salic_payment_records"
  ADD CONSTRAINT "salic_payment_records_planningProjectId_fkey"
  FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
