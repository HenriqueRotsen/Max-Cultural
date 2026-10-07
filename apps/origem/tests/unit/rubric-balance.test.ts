import { describe, expect, it } from "vitest";
import {
  canReserveAmount,
  computeCaptacaoFactors,
  computeProjectBalance,
  isAdminProduct,
  roundCents,
} from "@/lib/planning/rubric-balance";

describe("rubric-balance", () => {
  it("detecta produto administração", () => {
    expect(isAdminProduct("Administração do Projeto")).toBe(true);
    expect(isAdminProduct("Produção")).toBe(false);
  });

  it("sem sinal de captação: teto do projeto = 100% do aprovado", () => {
    const f = computeCaptacaoFactors({ totalApproved: 1000 });
    expect(f.pctCaptadoT).toBe(1);
    expect(f.operableBase).toBe(0);
    expect(f.projectCap).toBe(1000);
  });

  it("com captação: teto do projeto = operable; % = operable / aprovado", () => {
    const f = computeCaptacaoFactors({
      totalApproved: 1000,
      valorCaptado: 500,
    });
    expect(f.pctCaptadoT).toBe(0.5);
    expect(f.projectCap).toBe(500);
  });

  it("captação parcial: rubrica inteira disponível; teto só no projeto", () => {
    const bal = computeProjectBalance({
      lines: [{ id: "a", approvedAmount: 1000, productName: "TI" }],
      commitments: [],
      valorCaptado: 500,
    });
    expect(bal.pctCaptadoT).toBe(0.5);
    expect(bal.totalAvailableCap).toBe(500);
    expect(bal.lines.get("a")!.availableCap).toBe(1000);
    expect(bal.lines.get("a")!.available).toBe(1000);
  });

  it("administração também usa aprovado integral na rubrica", () => {
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
    expect(bal.totalAvailableCap).toBe(600);
    expect(bal.lines.get("a")!.availableCap).toBe(1000);
    expect(bal.lines.get("b")!.isAdmin).toBe(true);
    expect(bal.lines.get("b")!.availableCap).toBe(200);
    expect(bal.lines.get("b")!.available).toBe(200);
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
    expect(bal.totalAvailableCap).toBe(1200);
    // Saldo MinC = aprovado − pago (reserva em aberto não entra)
    expect(bal.lines.get("a")!.saldo).toBe(900);
    expect(bal.lines.get("b")!.saldo).toBe(200);
    expect(bal.totalSaldo).toBe(1100);
    // Disponível na rubrica = aprovado − reservado
    expect(bal.lines.get("a")!.available).toBe(600);
    expect(bal.lines.get("b")!.isAdmin).toBe(true);
    expect(bal.lines.get("b")!.available).toBe(200);
  });

  it("ARTE EM CORES 5ª: teto = operable; rubricas mantêm aprovado integral", () => {
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
    const total = 1923662.18 + 823281.78;
    const pct = bal.operableBase / total;
    expect(bal.operableBase).toBeCloseTo(1394628.56, 2);
    expect(bal.pctCaptadoT).toBeCloseTo(pct, 6);
    expect(bal.totalAvailableCap).toBeCloseTo(1394628.56, 2);
    expect(bal.lines.get("admin")!.availableCap).toBeCloseTo(823281.78, 2);
    expect(bal.lines.get("prod")!.availableCap).toBeCloseTo(1923662.18, 2);
  });

  it("salicComprovado preenche pago e reservado sem reservas locais", () => {
    const bal = computeProjectBalance({
      lines: [{ id: "a", approvedAmount: 1000, productName: "TI", salicComprovado: 350 }],
      commitments: [],
      valorCaptado: 1000,
    });
    expect(bal.lines.get("a")!.paid).toBe(350);
    expect(bal.lines.get("a")!.reserved).toBe(350);
    expect(bal.lines.get("a")!.saldo).toBe(650);
    expect(bal.lines.get("a")!.available).toBe(650);
    expect(bal.totalPaid).toBe(350);
    expect(bal.totalSaldo).toBe(650);
  });

  it("local não publicado + salic: soma o gap (sem double-count do publicado)", () => {
    const bal = computeProjectBalance({
      lines: [{ id: "a", approvedAmount: 1000, productName: "TI", salicComprovado: 500 }],
      commitments: [{ budgetLineId: "a", amount: 300, status: "PAID" }],
      valorCaptado: 1000,
      publishedPaidByLine: {},
    });
    expect(bal.lines.get("a")!.paid).toBe(800);
    expect(bal.lines.get("a")!.reserved).toBe(800);
    expect(bal.lines.get("a")!.saldo).toBe(200);
    expect(bal.lines.get("a")!.available).toBe(200);
  });

  it("local já publicado no SALIC: não soma de novo o salicComprovado", () => {
    const bal = computeProjectBalance({
      lines: [{ id: "a", approvedAmount: 1000, productName: "TI", salicComprovado: 500 }],
      commitments: [{ budgetLineId: "a", amount: 500, status: "PAID" }],
      valorCaptado: 1000,
      publishedPaidByLine: { a: 500 },
    });
    expect(bal.lines.get("a")!.paid).toBe(500);
    expect(bal.lines.get("a")!.reserved).toBe(500);
  });

  it("bloqueia reserva acima do aprovado da rubrica sem permissão de excesso", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "a", approvedAmount: 100, productName: "TI" },
        { id: "b", approvedAmount: 100, productName: "Outros" },
      ],
      commitments: [{ budgetLineId: "a", amount: 90, status: "RESERVED" }],
      valorCaptado: 200,
    });
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

  it("não permite gastar além do teto do projeto mesmo com excesso na rubrica", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "a", approvedAmount: 1000, productName: "TI" },
        { id: "b", approvedAmount: 1000, productName: "Outros" },
      ],
      commitments: [],
      valorCaptado: 500,
    });
    // Rubrica a tem 1000 disponíveis, mas teto do projeto é 500.
    const denied = canReserveAmount({
      balance: bal,
      lineId: "a",
      amount: 600,
      allowOverflow: true,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.message).toMatch(/teto operacional/i);

    const ok = canReserveAmount({
      balance: bal,
      lineId: "a",
      amount: 500,
      allowOverflow: false,
    });
    expect(ok.ok).toBe(true);
  });

  it("com excesso: permite até 2× a rubrica se couber no teto do projeto", () => {
    const bal = computeProjectBalance({
      lines: [
        { id: "a", approvedAmount: 100, productName: "TI" },
        { id: "b", approvedAmount: 900, productName: "Outros" },
      ],
      commitments: [],
      valorCaptado: 1000,
    });
    const ok = canReserveAmount({
      balance: bal,
      lineId: "a",
      amount: 200,
      allowOverflow: true,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.overflow).toBe(true);

    const tooMuch = canReserveAmount({
      balance: bal,
      lineId: "a",
      amount: 201,
      allowOverflow: true,
    });
    expect(tooMuch.ok).toBe(false);
  });

  it("arredonda totais para centavos (evita deriva de float)", () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(10.105)).toBe(10.11);
    const bal = computeProjectBalance({
      lines: [
        { id: "a", approvedAmount: 10.105, productName: "Produção" },
        { id: "b", approvedAmount: 20.105, productName: "Produção" },
      ],
      commitments: [],
    });
    expect(bal.totalApproved).toBe(30.22);
    expect(bal.lines.get("a")!.approved).toBe(10.11);
  });
});
