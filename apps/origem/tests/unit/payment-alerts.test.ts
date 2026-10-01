import { describe, expect, it } from "vitest";
import {
  paymentAlertHref,
  paymentAlertHrefsForCommitment,
  summarizePaymentDeadlines,
} from "@/lib/planning/payment-alerts";

describe("payment-alerts", () => {
  it("builds contas-a-pagar hrefs", () => {
    expect(paymentAlertHref("abc", "overdue")).toBe(
      "/planejamento/contas-a-pagar?due=overdue&c=abc",
    );
    expect(paymentAlertHrefsForCommitment("abc")).toContain(
      "/planejamento/compromissos/abc",
    );
  });

  it("summarizes overdue and upcoming", () => {
    const summary = summarizePaymentDeadlines(
      [
        { expectedPayAt: "2026-08-01T12:00:00.000Z", amount: 100 },
        { expectedPayAt: "2026-09-10T12:00:00.000Z", amount: 50 },
        { expectedPayAt: "2026-10-01T12:00:00.000Z", amount: 200 },
      ],
      { dueSoonDays: 5, now: new Date("2026-09-08T12:00:00") },
    );
    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueAmount).toBe(100);
    expect(summary.upcomingCount).toBe(1);
    expect(summary.upcomingAmount).toBe(50);
  });
});
