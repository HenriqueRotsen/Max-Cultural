import { describe, expect, it } from "vitest";
import {
  federalTaxDueDateFromCompetence,
  federalTaxTotal,
  issDueDateFromCompetence,
  taxDueSummaryFromCompetence,
} from "@/lib/planning/tax-due-dates";
import {
  defaultPaymentReminderDate,
  parseReminderDate,
} from "@/lib/planning/reminder-dates";

describe("tax-due-dates", () => {
  it("ISS vence no dia 10 do mês seguinte", () => {
    const due = issDueDateFromCompetence(new Date("2026-07-15T12:00:00Z"));
    expect(due.getUTCDate()).toBe(10);
    expect(due.getUTCMonth()).toBe(7);
  });

  it("federais vencem no dia 20 do mês seguinte", () => {
    const due = federalTaxDueDateFromCompetence(new Date("2026-07-15T12:00:00Z"));
    expect(due.getUTCDate()).toBe(20);
    expect(due.getUTCMonth()).toBe(7);
  });

  it("soma retenções federais sem ISS", () => {
    expect(
      federalTaxTotal({ iss: 10, irrf: 5, pis: 1, cofins: 2, csll: 3, inss: 4 }),
    ).toBe(15);
  });

  it("monta resumo por competência", () => {
    const s = taxDueSummaryFromCompetence(new Date("2026-06-01T12:00:00Z"), {
      iss: 50,
      irrf: 10,
    });
    expect(s.issAmount).toBe(50);
    expect(s.federalAmount).toBe(10);
    expect(s.issDue?.getUTCDate()).toBe(10);
    expect(s.federalDue?.getUTCDate()).toBe(20);
  });
});

describe("reminder-dates", () => {
  it("parseia YYYY-MM-DD", () => {
    const d = parseReminderDate("2026-08-15", new Date("2026-01-01T12:00:00Z"));
    expect(d.toISOString().slice(0, 10)).toBe("2026-08-15");
  });

  it("sugere lembrete N dias antes quando ainda no futuro", () => {
    const expected = new Date("2027-03-10T12:00:00Z");
    const reminder = defaultPaymentReminderDate(expected, 5);
    const reminderDate = parseReminderDate(reminder, expected);
    expect(reminderDate.getTime()).toBeLessThan(expected.getTime());
  });
});
