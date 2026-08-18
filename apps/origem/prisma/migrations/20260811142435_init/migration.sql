-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('api', 'crawler');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('pending', 'running', 'success', 'error', 'partial');

-- CreateTable
CREATE TABLE "SalicAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cgccpf" TEXT NOT NULL,
    "salicUsername" TEXT,
    "salicPasswordEnc" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalicAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "pronac" TEXT NOT NULL,
    "name" TEXT,
    "salicProjectId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "salicAccountId" TEXT NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "cgccpf" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "salicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "source" "PaymentSource" NOT NULL,
    "itemName" TEXT,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "paymentDate" TIMESTAMP(3),
    "approvalDate" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentDocumentNumber" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "fileId" TEXT,
    "fileName" TEXT,
    "justification" TEXT,
    "planilhaAprovacaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchedSupplier" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "cgccpf" TEXT,
    "nameQuery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierId" TEXT,

    CONSTRAINT "WatchedSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'pending',
    "forceCrawler" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "projectsSynced" INTEGER NOT NULL DEFAULT 0,
    "paymentsUpserted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "log" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salicAccountId" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalicAccount_active_idx" ON "SalicAccount"("active");

-- CreateIndex
CREATE UNIQUE INDEX "SalicAccount_cgccpf_key" ON "SalicAccount"("cgccpf");

-- CreateIndex
CREATE INDEX "Project_pronac_idx" ON "Project"("pronac");

-- CreateIndex
CREATE UNIQUE INDEX "Project_salicAccountId_pronac_key" ON "Project"("salicAccountId", "pronac");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_cgccpf_key" ON "Supplier"("cgccpf");

-- CreateIndex
CREATE INDEX "Payment_supplierId_idx" ON "Payment"("supplierId");

-- CreateIndex
CREATE INDEX "Payment_projectId_idx" ON "Payment"("projectId");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_source_externalId_key" ON "Payment"("source", "externalId");

-- CreateIndex
CREATE INDEX "WatchedSupplier_cgccpf_idx" ON "WatchedSupplier"("cgccpf");

-- CreateIndex
CREATE INDEX "WatchedSupplier_nameQuery_idx" ON "WatchedSupplier"("nameQuery");

-- CreateIndex
CREATE INDEX "SyncRun_status_idx" ON "SyncRun"("status");

-- CreateIndex
CREATE INDEX "SyncRun_createdAt_idx" ON "SyncRun"("createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_salicAccountId_fkey" FOREIGN KEY ("salicAccountId") REFERENCES "SalicAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchedSupplier" ADD CONSTRAINT "WatchedSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_salicAccountId_fkey" FOREIGN KEY ("salicAccountId") REFERENCES "SalicAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
