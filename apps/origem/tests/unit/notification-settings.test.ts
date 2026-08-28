import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFS,
  enabledNotificationTypes,
  notificationTypeLabel,
} from "@/lib/planning/notification-settings";

describe("notification-settings", () => {
  it("habilita todos os tipos por padrão", () => {
    expect(enabledNotificationTypes(DEFAULT_NOTIFICATION_PREFS)).toEqual([
      "PAYMENT_DUE_SOON",
      "PAYMENT_OVERDUE",
      "RUBRIC_NEAR",
      "NF_PENDING",
      "TAX_DUE_ISS",
      "TAX_DUE_FEDERAL",
    ]);
  });

  it("respeita toggles desligados", () => {
    expect(
      enabledNotificationTypes({
        ...DEFAULT_NOTIFICATION_PREFS,
        paymentDueSoon: false,
        rubricNear: false,
        nfPending: false,
        taxDueIss: false,
        taxDueFederal: false,
      }),
    ).toEqual(["PAYMENT_OVERDUE"]);
  });

  it("rotula tipos conhecidos", () => {
    expect(notificationTypeLabel("PAYMENT_OVERDUE")).toBe("Pagamento em atraso");
    expect(notificationTypeLabel("NF_PENDING")).toBe(
      "NF pendente após pagamento",
    );
    expect(notificationTypeLabel("TAX_DUE_ISS")).toBe("ISS retido (dia 10)");
    expect(notificationTypeLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});
