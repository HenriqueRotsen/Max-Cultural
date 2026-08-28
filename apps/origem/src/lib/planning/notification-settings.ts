import type { AppNotificationType } from "@/generated/prisma/enums";

export type NotificationPrefs = {
  paymentDueSoon: boolean;
  paymentOverdue: boolean;
  rubricNear: boolean;
  nfPending: boolean;
  taxDueIss: boolean;
  taxDueFederal: boolean;
  emailEnabled: boolean;
  dueSoonDaysAhead: number;
  nfPendingDaysAfterPaid: number;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  paymentDueSoon: true,
  paymentOverdue: true,
  rubricNear: true,
  nfPending: true,
  taxDueIss: true,
  taxDueFederal: true,
  emailEnabled: false,
  dueSoonDaysAhead: 5,
  nfPendingDaysAfterPaid: 7,
};

export const NOTIFICATION_TYPE_META: Record<
  AppNotificationType,
  {
    label: string;
    prefKey:
      | "paymentDueSoon"
      | "paymentOverdue"
      | "rubricNear"
      | "nfPending"
      | "taxDueIss"
      | "taxDueFederal";
  }
> = {
  PAYMENT_DUE_SOON: { label: "Pagamento previsto", prefKey: "paymentDueSoon" },
  PAYMENT_OVERDUE: { label: "Pagamento em atraso", prefKey: "paymentOverdue" },
  RUBRIC_NEAR: { label: "Rubrica quase esgotada", prefKey: "rubricNear" },
  NF_PENDING: { label: "NF pendente após pagamento", prefKey: "nfPending" },
  TAX_DUE_ISS: { label: "ISS retido (dia 10)", prefKey: "taxDueIss" },
  TAX_DUE_FEDERAL: {
    label: "Impostos federais (dia 20)",
    prefKey: "taxDueFederal",
  },
};

export function notificationTypeLabel(type: string): string {
  return (
    NOTIFICATION_TYPE_META[type as AppNotificationType]?.label || type
  );
}

export function enabledNotificationTypes(
  prefs: NotificationPrefs,
): AppNotificationType[] {
  const types: AppNotificationType[] = [];
  if (prefs.paymentDueSoon) types.push("PAYMENT_DUE_SOON");
  if (prefs.paymentOverdue) types.push("PAYMENT_OVERDUE");
  if (prefs.rubricNear) types.push("RUBRIC_NEAR");
  if (prefs.nfPending) types.push("NF_PENDING");
  if (prefs.taxDueIss) types.push("TAX_DUE_ISS");
  if (prefs.taxDueFederal) types.push("TAX_DUE_FEDERAL");
  return types;
}
