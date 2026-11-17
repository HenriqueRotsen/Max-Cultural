import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { agencyFactor, parseAgencyPct } from "@/lib/catalog/supplier-agency";
import { checkProjectCaps } from "@/lib/planning/project-caps";

const caps = { supplierCapPct: 20, bondCapPct: 15, rubricOverrunPct: 50 };

describe("fornecedor agência", () => {
  it("lê o percentual do formulário", () => {
    expect(parseAgencyPct("")).toBeNull();
    expect(parseAgencyPct("10")).toBe(10);
    expect(parseAgencyPct("12,5%")).toBe(12.5);
    expect(parseAgencyPct("0")).toHaveProperty("error");
    expect(parseAgencyPct("100")).toHaveProperty("error");
  });

  it("fator por CNPJ, com ou sem máscara", () => {
    const map = new Map([["11222333000181", 10]]);
    expect(agencyFactor(map, "11.222.333/0001-81")).toBeCloseTo(0.1);
    expect(agencyFactor(map, "99888777000166")).toBe(1);
  });

  it("agência de 10%: R$ 100 mil pagos contam R$ 10 mil e cabem no limite", () => {
    // Projeto de R$ 100 mil, limite 20% = R$ 20 mil; já contou R$ 15 mil.
    const base = {
      caps,
      projectTotal: 100_000,
      supplierTotalBefore: 15_000,
      inBondGroup: false,
      bondGroupTotalBefore: 0,
      supplierName: "Agência X",
    };
    expect(checkProjectCaps({ ...base, amount: 50_000 * 0.1, agencyPct: 10 })).toBeNull();
    const msg = checkProjectCaps({ ...base, amount: 100_000 * 0.1, agencyPct: 10 });
    expect(msg).toContain("é agência: conta 10% do valor pago");
  });
});
