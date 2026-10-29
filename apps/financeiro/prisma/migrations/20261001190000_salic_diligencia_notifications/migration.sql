-- AlterEnum
DO $$ BEGIN
  ALTER TYPE "AppNotificationType" ADD VALUE 'SALIC_DILIGENCIA';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "salicDiligencia" BOOLEAN NOT NULL DEFAULT true;
