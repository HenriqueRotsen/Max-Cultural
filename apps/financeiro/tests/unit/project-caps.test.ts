import { describe, expect, it } from "vitest";
import { checkProjectCaps, parseProjectCaps, projectCapsOf } from "@/lib/planning/project-caps";
import { canReserveAmount, computeProjectBalance } from "@/lib/planning/rubric-balance";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const caps = { supplierCapPct: 20, bondCapPct: 15, rubricOverrunPct: 50 };

describe("limites do projeto (no lugar da IN)", () => {
  it("lê o formulário, com padrão quando vazio e vírgula decimal", () => {
    expect(parseProjectCaps(fd({ supplierCapPct: "25", bondCapPct: "12,5", rubricOverrunPct: "" }))).toEqual({
      supplierCapPct: 25,
      bondCapPct: 12.5,
      rubricOverrunPct: 100,
    });
    expect(parseProjectCaps(fd({ supplierCapPct: "120" }))).toHaveProperty("error");
    expect(projectCapsOf({ supplierCapPct: "20.00", bondCapPct: null })).toMatchObject({
      supplierCapPct: 20,
      bondCapPct: 20,
    });
  });

  it("bloqueia o mesmo fornecedor acima do limite", () => {
    const base = { caps, projectTotal: 100_000, supplierName: "Som", inBondGroup: false, bondGroupTotalBefore: 0 };
    expect(checkProjectCaps({ ...base, amount: 5_000, supplierTotalBefore: 15_000 })).toBeNull();
    expect(checkProjectCaps({ ...base, amount: 5_001, supplierTotalBefore: 15_000 })).toMatch(/20%/);
  });

  it("vínculo soma proponente + vinculados no próprio limite", () => {
    const base = { caps, projectTotal: 100_000, supplierName: "Sócio", inBondGroup: true, supplierTotalBefore: 0 };
    expect(checkProjectCaps({ ...base, amount: 5_000, bondGroupTotalBefore: 10_000 })).toBeNull();
    expect(checkProjectCaps({ ...base, amount: 5_001, bondGroupTotalBefore: 10_000 })).toMatch(/vínculo.*15%/);
  });

  it("excesso na rubrica segue o percentual do projeto", () => {
    const balance = computeProjectBalance({
      // Segunda rubrica só para o teto do projeto não ser o limite.
      lines: [
        { id: "l1", approvedAmount: 1000, productName: "Produção" },
        { id: "l2", approvedAmount: 5000, productName: "Produção" },
      ],
      commitments: [],
      rubricOverrunPct: 50,
    });
    expect(canReserveAmount({ lineId: "l1", amount: 1500, balance, allowOverflow: true })).toMatchObject({ ok: true });
    const over = canReserveAmount({ lineId: "l1", amount: 1501, balance, allowOverflow: true });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toMatch(/50%/);
  });
});
