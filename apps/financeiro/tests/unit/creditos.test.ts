import { describe, expect, it } from "vitest";
import {
  creditRemaining,
  fiscalRemaining,
  scaleAllocationsToAmount,
  suggestedCreditUse,
  validateCreditUse,
} from "@/lib/planning/credits";

describe("créditos (pagamento sem nota)", () => {
  it("exemplo do hotel: TED de 1.858,50 paga 619,50 de uma nota e 1.239 de outra", () => {
    const credit = 1858.5;
    const after1 = creditRemaining(credit, [{ amount: 619.5 }]);
    expect(after1).toBe(1239);
    expect(creditRemaining(credit, [{ amount: 619.5 }, { amount: 1239 }])).toBe(0);
    // Nota 103002 de 1.239 já tinha 619,50 pagos: falta 619,50.
    expect(fiscalRemaining(1239, 619.5)).toBe(619.5);
    expect(suggestedCreditUse(credit, 619.5)).toBe(619.5);
  });

  it("não usa mais que o saldo do crédito nem mais que falta da nota", () => {
    expect(validateCreditUse({ amount: 700, creditLeft: 600, nfLeft: 1000 })).toContain("só tem");
    expect(validateCreditUse({ amount: 1300, creditLeft: 1800, nfLeft: 1200 })).toContain("Falta pagar só");
    expect(validateCreditUse({ amount: 100, creditLeft: 1800, nfLeft: 0 })).toBe("Esta nota já está paga.");
    expect(validateCreditUse({ amount: 0, creditLeft: 1800, nfLeft: 100 })).toContain("Informe");
    expect(validateCreditUse({ amount: 1200, creditLeft: 1800, nfLeft: 1200 })).toBeNull();
  });

  it("divide o uso nas rubricas da nota, na mesma proporção, fechando os centavos", () => {
    const parts = scaleAllocationsToAmount(
      [
        { id: "a", amount: 1000 },
        { id: "b", amount: 500 },
        { id: "c", amount: 500 },
      ],
      1000,
    );
    expect(parts.map((p) => p.amount)).toEqual([500, 250, 250]);
    const odd = scaleAllocationsToAmount(
      [
        { id: "a", amount: 1 },
        { id: "b", amount: 1 },
        { id: "c", amount: 1 },
      ],
      100,
    );
    expect(odd.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(100, 2);
    expect(odd[2]!.amount).toBe(33.34);
  });
});
