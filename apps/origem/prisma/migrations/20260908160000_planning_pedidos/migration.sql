-- CreateEnum
CREATE TYPE "PedidoStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "planning_pedidos" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planningProjectId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "description" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "status" "PedidoStatus" NOT NULL DEFAULT 'OPEN',
    "sourceDocumentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_pedidos_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "rubric_commitments" ADD COLUMN "pedidoId" TEXT;
ALTER TABLE "rubric_commitments" ADD COLUMN "installmentNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "planning_pedidos_sourceDocumentId_key" ON "planning_pedidos"("sourceDocumentId");
CREATE INDEX "planning_pedidos_workspaceId_status_idx" ON "planning_pedidos"("workspaceId", "status");
CREATE INDEX "planning_pedidos_planningProjectId_idx" ON "planning_pedidos"("planningProjectId");
CREATE INDEX "planning_pedidos_supplierId_idx" ON "planning_pedidos"("supplierId");
CREATE INDEX "rubric_commitments_pedidoId_idx" ON "rubric_commitments"("pedidoId");

-- AddForeignKey
ALTER TABLE "planning_pedidos" ADD CONSTRAINT "planning_pedidos_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_pedidos" ADD CONSTRAINT "planning_pedidos_planningProjectId_fkey" FOREIGN KEY ("planningProjectId") REFERENCES "planning_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_pedidos" ADD CONSTRAINT "planning_pedidos_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "catalog_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_pedidos" ADD CONSTRAINT "planning_pedidos_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "planning_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rubric_commitments" ADD CONSTRAINT "rubric_commitments_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "planning_pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
