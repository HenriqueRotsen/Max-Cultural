import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { chaveCpf, contarCpfsUnicos, cpfsPorGrupo, cpfsUnicosPorEtapa } from "@/lib/cpfs-unicos";

describe("CPFs únicos", () => {
  it("normaliza pontuação e zeros cortados pela planilha", () => {
    expect(chaveCpf("012.345.678-90")).toBe("01234567890");
    expect(chaveCpf("1234567890")).toBe("01234567890");
    expect(chaveCpf("")).toBeNull();
    expect(chaveCpf("123")).toBeNull();
  });

  it("conta cada pessoa uma vez", () => {
    expect(contarCpfsUnicos(["012.345.678-90", "01234567890", "1234567890", "98765432100", "", null])).toBe(2);
  });

  it("conta por grupo sem misturar grupos", () => {
    const g = cpfsPorGrupo();
    g.add("a", { cpf: "11111111111" });
    g.add("a", { cpf: "111.111.111-11", selecionados: 1 });
    g.add("b", { cpf: "11111111111" });
    g.add("b", { cpf: "22222222222" });
    expect(g.total("a")).toEqual({ inscritos: 1, selecionados: 1, participantes: 0, certificados: 0 });
    expect(g.total("b").inscritos).toBe(2);
    expect(g.total("c").inscritos).toBe(0);
  });

  it("conta cada pessoa uma vez em cada etapa", () => {
    const r = cpfsUnicosPorEtapa([
      // A pessoa 1 fez duas ações: selecionada nas duas, certificada em uma.
      { cpf: "11111111111", selecionados: 1, participantes: 1, certificado: 1 },
      { cpf: "111.111.111-11", selecionados: 1, participantes: 1, certificado: 0 },
      { cpf: "22222222222", selecionados: 1, participantes: 0, certificado: 0 },
      { cpf: "33333333333", selecionados: 0, participantes: 0, certificado: 0 },
      { cpf: "", selecionados: 1, participantes: 1, certificado: 1 },
    ]);
    expect(r).toEqual({ inscritos: 3, selecionados: 2, participantes: 1, certificados: 1 });
  });
});
