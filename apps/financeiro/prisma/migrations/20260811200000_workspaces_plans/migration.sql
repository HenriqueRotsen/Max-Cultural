-- CreateEnum
CREATE TYPE "AppPlan" AS ENUM ('ESSENTIAL', 'PRO');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "AppPlan" NOT NULL DEFAULT 'ESSENTIAL',
    "maxAccounts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workspace_plan_idx" ON "Workspace"("plan");

-- Bootstrap: workspace único para dados existentes (Pro local/legado)
INSERT INTO "Workspace" ("id", "name", "plan", "maxAccounts", "createdAt", "updatedAt")
VALUES ('ws_bootstrap_local', 'Salink', 'PRO', 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable AppUser
ALTER TABLE "AppUser" ADD COLUMN "workspaceId" TEXT;

UPDATE "AppUser" SET "workspaceId" = 'ws_bootstrap_local' WHERE "workspaceId" IS NULL;

ALTER TABLE "AppUser" ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX "AppUser_workspaceId_idx" ON "AppUser"("workspaceId");

ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable SalicAccount
ALTER TABLE "SalicAccount" ADD COLUMN "workspaceId" TEXT;

UPDATE "SalicAccount" SET "workspaceId" = 'ws_bootstrap_local' WHERE "workspaceId" IS NULL;

ALTER TABLE "SalicAccount" ALTER COLUMN "workspaceId" SET NOT NULL;

DROP INDEX IF EXISTS "SalicAccount_cgccpf_key";

CREATE UNIQUE INDEX "SalicAccount_workspaceId_cgccpf_key" ON "SalicAccount"("workspaceId", "cgccpf");

CREATE INDEX "SalicAccount_workspaceId_idx" ON "SalicAccount"("workspaceId");

ALTER TABLE "SalicAccount" ADD CONSTRAINT "SalicAccount_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable WatchedSupplier
ALTER TABLE "WatchedSupplier" ADD COLUMN "workspaceId" TEXT;

UPDATE "WatchedSupplier" SET "workspaceId" = 'ws_bootstrap_local' WHERE "workspaceId" IS NULL;

ALTER TABLE "WatchedSupplier" ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX "WatchedSupplier_workspaceId_idx" ON "WatchedSupplier"("workspaceId");

ALTER TABLE "WatchedSupplier" ADD CONSTRAINT "WatchedSupplier_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
