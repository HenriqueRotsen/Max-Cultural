-- Opção de envio de notificações por e-mail

ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "emailEnabled" BOOLEAN NOT NULL DEFAULT false;
