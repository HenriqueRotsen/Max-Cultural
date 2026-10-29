-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN     "progressCurrent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progressMessage" TEXT,
ADD COLUMN     "progressTotal" INTEGER NOT NULL DEFAULT 0;
