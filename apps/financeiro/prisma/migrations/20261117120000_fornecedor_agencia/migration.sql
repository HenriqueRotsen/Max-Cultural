-- Fornecedor agência: só um percentual do que foi pago conta nos limites.
CREATE TABLE "supplier_agencies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_agencies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_agencies_workspaceId_cnpj_key" ON "supplier_agencies"("workspaceId", "cnpj");
ALTER TABLE "supplier_agencies" ADD CONSTRAINT "supplier_agencies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
