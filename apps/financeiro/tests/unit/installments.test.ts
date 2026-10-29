import { describe, expect, it } from "vitest";
import {
  addMonthsYmd,
  INSTALLMENT_COUNT_MAX,
  splitInstallments,
} from "@/lib/planning/installments";

describe("addMonthsYmd", () => {
  it("avança mês a mês", () => {
    expect(addMonthsYmd("2026-01-15", 0)).toBe("2026-01-15");
    expect(addMonthsYmd("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonthsYmd("2026-01-15", 11)).toBe("2026-12-15");
  });

  it("clamp dia no fim do mês", () => {
    expect(addMonthsYmd("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsYmd("2024-01-31", 1)).toBe("2024-02-29");
  });
});

describe("splitInstallments", () => {
  it("divide em 12× com centavos na última", () => {
    const parts = splitInstallments(1000.01, 12, "2026-01-10");
    expect(parts).toHaveLength(12);
    expect(parts[0]).toEqual({ amount: 83.33, expectedPayAt: "2026-01-10" });
    expect(parts[10]!.amount).toBe(83.33);
    expect(parts[11]).toEqual({ amount: 83.38, expectedPayAt: "2026-12-10" });
    const sum = Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    expect(sum).toBe(1000.01);
  });

  it("divisão exata", () => {
    const parts = splitInstallments(1200, 12, "2026-03-01");
    expect(parts.every((p) => p.amount === 100)).toBe(true);
    expect(parts[11]!.expectedPayAt).toBe("2027-02-01");
  });

  it("rejeita contagem fora do intervalo", () => {
    expect(() => splitInstallments(100, 1, "2026-01-01")).toThrow();
    expect(() =>
      splitInstallments(100, INSTALLMENT_COUNT_MAX + 1, "2026-01-01"),
    ).toThrow();
  });
});
