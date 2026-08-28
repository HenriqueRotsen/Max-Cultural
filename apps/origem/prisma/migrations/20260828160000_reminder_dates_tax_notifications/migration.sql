-- Lembrete personalizado de pagamento / NF + avisos de impostos (dia 10 e 20)

ALTER TABLE "rubric_commitments" ADD COLUMN "paymentReminderAt" TIMESTAMP(3);
ALTER TABLE "rubric_commitments" ADD COLUMN "nfReminderAt" TIMESTAMP(3);

CREATE INDEX "rubric_commitments_paymentReminderAt_idx" ON "rubric_commitments"("paymentReminderAt");
CREATE INDEX "rubric_commitments_nfReminderAt_idx" ON "rubric_commitments"("nfReminderAt");

ALTER TABLE "app_notifications" ADD COLUMN "scheduledFor" TIMESTAMP(3);
CREATE INDEX "app_notifications_scheduledFor_idx" ON "app_notifications"("scheduledFor");

ALTER TYPE "AppNotificationType" ADD VALUE 'TAX_DUE_ISS';
ALTER TYPE "AppNotificationType" ADD VALUE 'TAX_DUE_FEDERAL';

ALTER TABLE "notification_settings" ADD COLUMN "taxDueIss" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "notification_settings" ADD COLUMN "taxDueFederal" BOOLEAN NOT NULL DEFAULT true;
