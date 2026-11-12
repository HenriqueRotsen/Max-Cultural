import { describe, expect, it } from "vitest";
import {
  completeMaskedCpf,
  paymentsByPeriod,
  periodsFromQsa,
} from "@/lib/corporate/qsa-import";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("completeMaskedCpf", () => {
  const known = [
    { name: "IASMIN TAYNARA LIMA SILVA", cgccpf: "95454020320" },
    { name: "Outra Pessoa", cgccpf: "11154020399" },
  ];
  it("completa quando nome e dígitos batem", () => {
    expect(
      completeMaskedCpf({ name: "Iásmin Taynara Lima Silva", maskedCpfMiddle: "540203" }, known),
    ).toBe("95454020320");
  });
  it("não completa com nome diferente", () => {
    expect(completeMaskedCpf({ name: "IASMIN SILVA", maskedCpfMiddle: "540203" }, known)).toBe("");
  });
  it("não completa quando há duas pessoas possíveis", () => {
    const dup = [...known, { name: "IASMIN TAYNARA LIMA SILVA", cgccpf: "00054020300" }];
    expect(
      completeMaskedCpf({ name: "IASMIN TAYNARA LIMA SILVA", maskedCpfMiddle: "540203" }, dup),
    ).toBe("");
  });
});

describe("periodsFromQsa", () => {
  const base = { cgccpf: "", personType: "PF" as const, role: "PARTNER" as const };
  it("abre um intervalo a cada entrada (caso Babaculandia)", () => {
    const periods = periodsFromQsa(
      [
        { ...base, name: "IASMIN", joinedAt: d("2020-02-28") },
        { ...base, name: "JULIANO", joinedAt: d("2025-11-18") },
      ],
      d("2020-02-28"),
    );
    expect(periods).toHaveLength(2);
    expect(periods[0]!.members.map((m) => m.name)).toEqual(["IASMIN"]);
    expect(periods[0]!.validTo?.toISOString().slice(0, 10)).toBe("2025-11-17");
    expect(periods[1]!.members.map((m) => m.name)).toEqual(["IASMIN", "JULIANO"]);
    expect(periods[1]!.validTo).toBeNull();
  });
  it("sem data de entrada, vale desde a abertura", () => {
    const periods = periodsFromQsa([{ ...base, name: "A" }], d("2019-01-01"));
    expect(periods).toHaveLength(1);
    expect(periods[0]!.validFrom.toISOString().slice(0, 10)).toBe("2019-01-01");
  });
});

describe("paymentsByPeriod", () => {
  it("soma cada pagamento no intervalo da data, inclusive o último dia", () => {
    const periods = [
      { id: "p1", validFrom: d("2020-02-28"), validTo: d("2025-11-17") },
      { id: "p2", validFrom: d("2025-11-18"), validTo: null },
    ];
    const r = paymentsByPeriod(periods, [
      { amount: 100, paymentDate: d("2024-05-01") },
      { amount: 50.5, paymentDate: new Date("2025-11-17T23:00:00Z") },
      { amount: 10, paymentDate: d("2026-01-10") },
      { amount: 7, paymentDate: d("2019-01-01") },
      { amount: 3, paymentDate: null },
    ]);
    expect(r.byPeriod.get("p1")).toEqual({ count: 2, total: 150.5 });
    expect(r.byPeriod.get("p2")).toEqual({ count: 1, total: 10 });
    expect(r.outside).toEqual({ count: 2, total: 10 });
  });
});
