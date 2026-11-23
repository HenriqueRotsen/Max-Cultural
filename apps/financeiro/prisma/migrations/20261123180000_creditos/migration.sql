-- Créditos: pagamento sem nota, sem rubrica, usado depois pelas notas do fornecedor.
-- CreateTable
CREATE TABLE "payment_credits" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planningProjectId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "originalByteSize" INTEGER,
    "contentHash" TEXT,
    "extractedJson" JSONB,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_credit_uses" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "proofDocumentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_credit_uses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_credits_planningProjectId_idx" ON "payment_credits"("planningProjectId");

-- CreateIndex
CREATE INDEX "payment_credits_supplierId_idx" ON "payment_credits"("supplierId");

-- CreateIndex
CREATE INDEX "payment_credits_workspaceId_contentHash_idx" ON "payment_credits"("workspaceId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "payment_credit_uses_proofDocumentId_key" ON "payment_credit_uses"("proofDocumentId");

-- CreateIndex
CREATE INDEX "payment_credit_uses_creditId_idx" ON "payment_credit_uses"("creditId");

-- AddForeignKey
ALTER TABLE "payment_credits" ADD CONSTRAINT "payment_credits_planningProjectId_fkey" FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_credits" ADD CONSTRAINT "payment_credits_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "catalog_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_credit_uses" ADD CONSTRAINT "payment_credit_uses_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "payment_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_credit_uses" ADD CONSTRAINT "payment_credit_uses_proofDocumentId_fkey" FOREIGN KEY ("proofDocumentId") REFERENCES "planning_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

