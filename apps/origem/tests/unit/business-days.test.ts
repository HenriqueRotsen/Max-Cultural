import { describe, expect, it } from "vitest";
import {
  fifthBusinessDayNextMonth,
  nthBusinessDayOfMonth,
} from "@/lib/planning/business-days";

describe("business-days", () => {
  it("calcula o 5º dia útil de agosto/2026 (sex 07/08)", () => {
    const d = nthBusinessDayOfMonth(2026, 7, 5);
    expect(d.toISOString().slice(0, 10)).toBe("2026-08-07");
  });

  it("mês seguinte à emissão: jul/2026 → 5º DU de ago", () => {
    const from = new Date("2026-07-07T12:00:00-03:00");
    const due = fifthBusinessDayNextMonth(from);
    expect(due.toISOString().slice(0, 10)).toBe("2026-08-07");
  });

  it("vira o ano: dez/2026 → jan/2027", () => {
    const from = new Date("2026-12-15T12:00:00-03:00");
    const due = fifthBusinessDayNextMonth(from);
    expect(due.getUTCFullYear()).toBe(2027);
    expect(due.getUTCMonth()).toBe(0);
  });
});
