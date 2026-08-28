import { prisma } from "@/lib/db";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "@/lib/planning/notification-settings";

export async function getNotificationPrefs(
  workspaceId: string,
  userId: string | undefined | null,
): Promise<NotificationPrefs> {
  if (!userId) return { ...DEFAULT_NOTIFICATION_PREFS };
  const row = await prisma.notificationSettings.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
  });
  if (!row) {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
  return {
    paymentDueSoon: row.paymentDueSoon,
    paymentOverdue: row.paymentOverdue,
    rubricNear: row.rubricNear,
    nfPending: row.nfPending ?? true,
    taxDueIss: row.taxDueIss ?? true,
    taxDueFederal: row.taxDueFederal ?? true,
    emailEnabled: row.emailEnabled,
    dueSoonDaysAhead: Math.min(30, Math.max(1, row.dueSoonDaysAhead || 5)),
    nfPendingDaysAfterPaid: Math.min(
      90,
      Math.max(1, row.nfPendingDaysAfterPaid || 7),
    ),
  };
}
