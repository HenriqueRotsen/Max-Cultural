-- AlterTable
ALTER TABLE "roles" ADD COLUMN "dataScopeMode" "DataScopeMode" NOT NULL DEFAULT 'LIMITED';

-- CreateTable
CREATE TABLE "role_data_scopes" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "kind" "DataScopeKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "access" "DataScopeAccess" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_data_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_data_scopes_roleId_idx" ON "role_data_scopes"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_data_scopes_roleId_kind_resourceId_key" ON "role_data_scopes"("roleId", "kind", "resourceId");

-- AddForeignKey
ALTER TABLE "role_data_scopes" ADD CONSTRAINT "role_data_scopes_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
