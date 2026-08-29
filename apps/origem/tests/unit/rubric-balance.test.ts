import { describe, expect, it } from "vitest";
import {
  canReserveAmount,
  computeCaptacaoFactors,
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";

describe("rubric-balance", () => {
  it("detecta produto administração", () => {
    expect(isAdminProduct("Administração do Projeto")).toBe(true);
    expect(isAdminProduct("Produção")).toBe(false);
  });

  it("sem sinal de captação: disponível = 100% do aprovado", () => {
    const f = computeCaptacaoFactors({ totalApproved: 1000 });
    expect(f.pctCaptadoT).toBe(1);
    expect(f.operableBase).toBe(0);
  });

  it("com captação: % = operable / aprovado", () => {
    const f = computeCaptacaoFactors({
      totalApproved: 1000,
      valorCaptado: 500,
    });
    expect(f.pctCaptadoT).toBe(0.5);
  });

  it("com 50% captado reduz disponível operacional", () => {
    const bal = computeProjectBalance({
      lines: [{ id: "a", approvedAmount: 1000, productName: "TI" }],
      commitments: [],
      valorCaptado: 500,
    });
    expect(bal.pctCaptadoT).toBe(0.5);
    expect(bal.lines.get("a")!.availableCap).toBe(500);
    expect(bal.lines.get("a")!.available).toBe(500);
  });

  it("administração mantém 100% do aprovado mesmo com captação parcial", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "a", approvedAmount: 1000, productName: "Produção" },
        { id: "b", approvedAmount: 200, productName: "Administração do Projeto" },
      ],
      commitments: [],
      valorCaptado: 600,
    });
    expect(bal.pctCaptadoT).toBe(0.5);
    expect(bal.operableBase).toBe(600);
    expect(bal.lines.get("a")!.availableCap).toBe(500);
    expect(bal.lines.get("b")!.isAdmin).toBe(true);
    expect(bal.lines.get("b")!.availableCap).toBe(200);
    expect(bal.lines.get("b")!.available).toBe(200);
    expect(bal.totalAvailableCap).toBe(700);
  });

  it("calcula saldo por linha e total", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "a", approvedAmount: 1000, productName: "Produção" },
        { id: "b", approvedAmount: 200, productName: "Administração" },
      ],
      commitments: [
        { budgetLineId: "a", amount: 300, status: "RESERVED" },
        { budgetLineId: "a", amount: 100, status: "PAID" },
      ],
      valorCaptado: 1200,
    });

    expect(bal.totalApproved).toBe(1200);
    expect(bal.totalReserved).toBe(400);
    expect(bal.totalPaid).toBe(100);
    // pctCaptadoT = 1200/1200 = 1 → availableCap = approved
    expect(bal.lines.get("a")!.available).toBe(600);
    expect(bal.lines.get("b")!.isAdmin).toBe(true);
    expect(bal.lines.get("b")!.available).toBe(200);
  });

  it("ARTE EM CORES 5ª: produção segue captação; administração fica em 100%", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "prod", approvedAmount: 1923662.18, productName: "Produção" },
        {
          id: "admin",
          approvedAmount: 823281.78,
          productName: "Administração do Projeto",
        },
      ],
      commitments: [],
      valorCaptado: 1400000,
      captadoTransferido: 5371.44,
    });
    const pct =
      bal.operableBase /
      (1923662.18 + 823281.78);
    expect(bal.operableBase).toBeCloseTo(1394628.56, 2);
    expect(bal.pctCaptadoT).toBeCloseTo(pct, 6);
    expect(bal.lines.get("admin")!.availableCap).toBeCloseTo(823281.78, 2);
    expect(bal.lines.get("prod")!.availableCap).toBeCloseTo(
      1923662.18 * pct,
      2,
    );
    expect(bal.totalAvailableCap).toBeCloseTo(
      823281.78 + 1923662.18 * pct,
      2,
    );
  });

  it("bloqueia reserva acima do disponível sem permissão de excesso", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "a", approvedAmount: 100, productName: "TI" },
        { id: "b", approvedAmount: 100, productName: "Outros" },
      ],
      commitments: [{ budgetLineId: "a", amount: 90, status: "RESERVED" }],
      valorCaptado: 200,
    });
    // disponível em a = 10
    const denied = canReserveAmount({
      balance: bal,
      lineId: "a",
      amount: 20,
      allowOverflow: false,
    });
    expect(denied.ok).toBe(false);

    const allowed = canReserveAmount({
      balance: bal,
      lineId: "a",
      amount: 20,
      allowOverflow: true,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.overflow).toBe(true);
  });
});
