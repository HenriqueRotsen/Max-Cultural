import { describe, expect, it } from "vitest";
import { formatMoney, formatWhen } from "@/lib/origem-projects";

describe("origem-projects formatters", () => {
  it("formata dinheiro pt-BR", () => {
    expect(formatMoney(1234.5)).toMatch(/R\$\s*1\.234,50/);
    expect(formatMoney(Number.NaN)).toMatch(/R\$\s*0,00/);
  });

  it("formata data/hora ou devolve iso", () => {
    const out = formatWhen("2026-08-27T15:00:00.000Z");
    expect(out.length).toBeGreaterThan(0);
    expect(formatWhen("not-a-date")).toBe("not-a-date");
  });
});
