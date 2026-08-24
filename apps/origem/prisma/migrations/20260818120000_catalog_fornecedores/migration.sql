-- CreateTable
CREATE TABLE "catalog_suppliers" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "streetType" TEXT,
    "streetName" TEXT,
    "streetNumber" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "cityIbgeCode" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "notes" TEXT,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_favorites" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_services" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "defaultPriceUnit" TEXT,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "avgPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_engagements" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "priceUnit" TEXT NOT NULL DEFAULT 'closed',
    "hiredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "deadlineDays" INTEGER,
    "deadlineDate" TIMESTAMP(3),
    "rating" INTEGER,
    "ratingComment" TEXT,
    "delayed" BOOLEAN NOT NULL DEFAULT false,
    "delayDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_engagements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_suppliers_workspaceId_cnpj_key" ON "catalog_suppliers"("workspaceId", "cnpj");
CREATE INDEX "catalog_suppliers_workspaceId_name_idx" ON "catalog_suppliers"("workspaceId", "name");
CREATE INDEX "catalog_suppliers_workspaceId_state_idx" ON "catalog_suppliers"("workspaceId", "state");
CREATE UNIQUE INDEX "catalog_favorites_workspaceId_supplierId_key" ON "catalog_favorites"("workspaceId", "supplierId");
CREATE INDEX "catalog_services_supplierId_name_idx" ON "catalog_services"("supplierId", "name");
CREATE INDEX "catalog_services_category_idx" ON "catalog_services"("category");
CREATE INDEX "catalog_engagements_workspaceId_hiredAt_idx" ON "catalog_engagements"("workspaceId", "hiredAt");

ALTER TABLE "catalog_suppliers" ADD CONSTRAINT "catalog_suppliers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_favorites" ADD CONSTRAINT "catalog_favorites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_favorites" ADD CONSTRAINT "catalog_favorites_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "catalog_suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_services" ADD CONSTRAINT "catalog_services_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "catalog_suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_engagements" ADD CONSTRAINT "catalog_engagements_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_engagements" ADD CONSTRAINT "catalog_engagements_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catalog_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
