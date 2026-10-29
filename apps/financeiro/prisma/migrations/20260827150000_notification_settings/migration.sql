-- Preferências de notificação por usuário

CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentDueSoon" BOOLEAN NOT NULL DEFAULT true,
    "paymentOverdue" BOOLEAN NOT NULL DEFAULT true,
    "rubricNear" BOOLEAN NOT NULL DEFAULT true,
    "dueSoonDaysAhead" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_settings_userId_key" ON "notification_settings"("userId");
CREATE INDEX "notification_settings_workspaceId_idx" ON "notification_settings"("workspaceId");

ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
