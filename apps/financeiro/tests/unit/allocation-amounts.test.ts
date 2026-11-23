import { describe, expect, it } from "vitest";
import { allocationAmounts, parseAllocationsJson } from "@/lib/planning/allocation-amounts";

describe("rateio por rubrica", () => {
  it("valores digitados em reais valem como estão", () => {
    const r = allocationAmounts(
      [
        { budgetLineId: "a", sharePct: 0, amount: 300.01 },
        { budgetLineId: "b", sharePct: 0, amount: 999.99 },
      ],
      1300,
    );
    expect(r.ok && r.slices.map((s) => s.amount)).toEqual([300.01, 999.99]);
  });
  it("valores em reais que não somam o total são barrados", () => {
    const r = allocationAmounts([{ budgetLineId: "a", sharePct: 0, amount: 300 }], 1300);
    expect(r.ok).toBe(false);
  });
  it("porcentagem fecha o total nos centavos", () => {
    const r = allocationAmounts(
      [
        { budgetLineId: "a", sharePct: 33.3333 },
        { budgetLineId: "b", sharePct: 33.3333 },
        { budgetLineId: "c", sharePct: 33.3334 },
      ],
      100,
    );
    expect(r.ok && r.slices.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(100, 2);
  });
  it("lê o rateio do formulário", () => {
    expect(parseAllocationsJson('[{"budgetLineId":"a","sharePct":50,"amount":"650"}]')).toEqual([
      { budgetLineId: "a", sharePct: 50, amount: 650 },
    ]);
    expect(parseAllocationsJson("x")).toBeNull();
  });
});
