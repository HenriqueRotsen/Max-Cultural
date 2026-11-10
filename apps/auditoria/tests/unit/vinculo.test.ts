import { describe, expect, it } from "vitest";
import {
  aggregateBondEligibleSuppliers,
  evaluatePronacSupplierCompliance,
  paymentCountsForBond,
} from "@/lib/compliance/rouanet";

describe("paymentCountsForBond", () => {
  it("sem marcação, alimentação e refeição não contam", () => {
    expect(paymentCountsForBond({ itemName: "Alimentação da equipe" })).toBe(false);
    expect(paymentCountsForBond({ itemName: "Refeição" })).toBe(false);
    expect(paymentCountsForBond({ itemName: "Hospedagem sem alimentação" })).toBe(true);
    expect(paymentCountsForBond({ itemName: "Cachê" })).toBe(true);
  });

  it("a marcação manual vence a regra automática", () => {
    expect(paymentCountsForBond({ itemName: "Cachê", countsForBond: false })).toBe(false);
    expect(paymentCountsForBond({ itemName: "Alimentação", countsForBond: true })).toBe(true);
    expect(paymentCountsForBond({ itemName: "Alimentação", countsForBond: null })).toBe(false);
  });

  it("a soma do vínculo ignora os pagamentos desligados", () => {
    const supplier = { name: "Renato", cgccpf: "12345678909" };
    const totals = aggregateBondEligibleSuppliers([
      { amount: 1200, itemName: "Cachê", countsForBond: false, supplier },
      { amount: 300, itemName: "Produção", supplier },
    ]);
    expect(totals).toEqual([{ name: "Renato", cgccpf: "12345678909", total: 300 }]);
  });
});

describe("soma do vínculo com o proponente", () => {
  it("quando nenhum pagamento conta, não usa o total pago no lugar", () => {
    const renato = { name: "Renato", cgccpf: "12345678909", total: 1200 };
    const base = {
      pronac: "220959",
      projectTotal: 1000,
      accountCgccpf: "11222333000181",
      relatedParties: [
        { cgccpf: renato.cgccpf, name: "Renato", countsTowardProponentCap: true as const },
      ],
      suppliers: [renato],
    };
    const codes = (bondSuppliers: Array<typeof renato>) =>
      evaluatePronacSupplierCompliance({ ...base, bondSuppliers }).map((a) => a.code);
    // Antes, uma lista vazia caía no total pago (1200 = 120% do captado).
    expect(codes([])).not.toContain("PROPONENT_GROUP_OVER_CAP");
    expect(codes([renato])).toContain("PROPONENT_GROUP_OVER_CAP");
  });
});
