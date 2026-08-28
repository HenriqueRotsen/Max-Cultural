-- Preferências por (workspace, usuário): um usuário pode ter prefs distintas por workspace.

DROP INDEX IF EXISTS "notification_settings_userId_key";

CREATE UNIQUE INDEX "notification_settings_workspaceId_userId_key" ON "notification_settings"("workspaceId", "userId");
