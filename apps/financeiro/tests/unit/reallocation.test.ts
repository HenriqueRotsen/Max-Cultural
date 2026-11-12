import { describe, expect, it } from "vitest";
import { autoBalance, type ReallocLine } from "@/lib/planning/reallocation";

const line = (id: string, value: number, extra: Partial<ReallocLine> = {}): ReallocLine => ({
  id,
  value,
  min: 0,
  max: value * 2,
  fixed: false,
  edited: false,
  ...extra,
});

describe("readequação: ajuste automático", () => {
  it("tira a diferença das rubricas com mais saldo livre, sem mexer na editada", () => {
    // A rubrica "a" subiu 810 (pago acima do aprovado); o resto precisa ceder 810.
    const res = autoBalance(
      [
        line("a", 26810, { edited: true, min: 26810 }),
        line("b", 1000, { min: 900 }), // 100 livre
        line("c", 3000, { min: 0 }), // 3.000 livre
      ],
      30000,
    );
    expect(res.remaining).toBe(0);
    expect(res.values.a).toBe(26810);
    const total = res.values.a! + res.values.b! + res.values.c!;
    expect(total).toBeCloseTo(30000, 2);
    expect(res.values.b!).toBeGreaterThanOrEqual(900);
  });

  it("não mexe em custos vinculados nem bloqueadas", () => {
    const res = autoBalance(
      [line("adm", 500, { fixed: true }), line("x", 100, { edited: true }), line("y", 600)],
      1100,
    );
    expect(res.values.adm).toBe(500);
    expect(res.values.y).toBe(500);
    expect(res.remaining).toBe(0);
  });

  it("avisa quando não há saldo livre suficiente", () => {
    const res = autoBalance([line("a", 1500, { edited: true }), line("b", 100, { min: 80 })], 1500);
    expect(res.values.b).toBe(80);
    expect(res.remaining).toBe(80);
  });

  it("trabalha em centavos (valores quebrados)", () => {
    const res = autoBalance([line("a", 814.37, { edited: true }), line("b", 0.5), line("c", 0.5)], 815);
    expect(res.remaining).toBe(0);
    expect(res.values.b! + res.values.c!).toBeCloseTo(0.63, 2);
  });
});
