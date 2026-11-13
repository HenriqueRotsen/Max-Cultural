import { describe, expect, it } from "vitest";
import { findBondHints } from "@/lib/corporate/bond-hints";

const base = {
  proponentDoc: "11111111000191",
  proponentName: "PROPONENTE ALPHA",
  proponentMembers: [
    { name: "ANA SILVA", cgccpf: "52998224725" },
    { name: "JOÃO SEM CPF", cgccpf: "" },
  ],
};

describe("findBondHints", () => {
  it("observado PF que é sócio do proponente (mesmo CPF)", () => {
    const h = findBondHints({
      ...base,
      observado: { doc: "529.982.247-25", name: "Ana Silva" },
      observadoMembers: [],
    });
    expect(h).toEqual([{ strength: "doc", text: "É sócio ou administrador de PROPONENTE ALPHA." }]);
  });

  it("empresa observada com sócio em comum", () => {
    const h = findBondHints({
      ...base,
      observado: { doc: "36498130000143", name: "EMPRESA X" },
      observadoMembers: [{ name: "ANA SILVA", cgccpf: "52998224725" }],
    });
    expect(h[0]).toEqual({ strength: "doc", text: "Sócio em comum com o proponente: ANA SILVA." });
  });

  it("proponente é sócio da empresa observada", () => {
    const h = findBondHints({
      ...base,
      observado: { doc: "36498130000143", name: "EMPRESA X" },
      observadoMembers: [{ name: "PROPONENTE ALPHA", cgccpf: "11111111000191" }],
    });
    expect(h[0]!.text).toBe("PROPONENTE ALPHA é sócio desta empresa.");
  });

  it("só o nome bate (sem CPF): pista fraca", () => {
    const h = findBondHints({
      ...base,
      observado: { doc: "36498130000143", name: "EMPRESA X" },
      observadoMembers: [{ name: "Joao Sem CPF", cgccpf: "" }],
    });
    expect(h).toHaveLength(1);
    expect(h[0]!.strength).toBe("name");
  });

  it("nomes iguais mas CPFs diferentes não contam", () => {
    const h = findBondHints({
      ...base,
      observado: { doc: "36498130000143", name: "EMPRESA X" },
      observadoMembers: [{ name: "ANA SILVA", cgccpf: "11144477735" }],
    });
    expect(h).toEqual([]);
  });

  it("sem nada em comum, sem pista", () => {
    expect(
      findBondHints({
        ...base,
        observado: { doc: "36498130000143", name: "EMPRESA X" },
        observadoMembers: [{ name: "OUTRA PESSOA", cgccpf: "11144477735" }],
      }),
    ).toEqual([]);
  });
});
