import { describe, expect, it } from "vitest";
import {
  adherenceRecommendThreshold,
  recommendRubric,
  scoreRubricAgainstText,
} from "@/lib/planning/recommend-rubric";

const lines = [
  {
    id: "ti",
    itemName: "Serviços de TI e desenvolvimento de software",
    stageName: "Produção",
    productName: "Produção",
    city: "Belo Horizonte",
    state: "MG",
    categoryHint: "ti_tecnologia",
    available: 5000,
  },
  {
    id: "limpeza",
    itemName: "Serviços de limpeza",
    stageName: "Produção",
    productName: "Produção",
    city: "Belo Horizonte",
    state: "MG",
    categoryHint: "facilities_limpeza",
    available: 8000,
  },
];

describe("recommend-rubric", () => {
  it("pontua mais a rubrica alinhada ao texto/CNAE", () => {
    const ti = scoreRubricAgainstText(lines[0]!, "desenvolvimento de software");
    const limpeza = scoreRubricAgainstText(lines[1]!, "desenvolvimento de software");
    expect(ti.score).toBeGreaterThan(limpeza.score);
    expect(ti.score).toBeLessThanOrEqual(100);
  });

  it("pontua rubrica de TI pelo código CNAE 62 na escala 0–100", () => {
    const ti = scoreRubricAgainstText(
      lines[0]!,
      "DESENVOLVIMENTO DE PROGRAMAS DE COMPUTADOR SOB ENCOMENDA",
      { cnaeCode: "6201501" },
    );
    const limpeza = scoreRubricAgainstText(
      lines[1]!,
      "DESENVOLVIMENTO DE PROGRAMAS DE COMPUTADOR SOB ENCOMENDA",
      { cnaeCode: "6201501" },
    );
    expect(ti.score).toBeGreaterThanOrEqual(40);
    expect(ti.score).toBeLessThanOrEqual(100);
    expect(ti.label).toContain("Categoria");
    expect(limpeza.score).toBeLessThan(ti.score);
  });

  it("dá aderência parcial por termos em comum sem categoria exata", () => {
    const partial = scoreRubricAgainstText(
      {
        itemName: "Desenvolvimento de conteúdo editorial",
        stageName: "Produção",
        productName: "Produção",
        categoryHint: "marketing_comunicacao",
        available: 3000,
      },
      "DESENVOLVIMENTO DE PROGRAMAS DE COMPUTADOR SOB ENCOMENDA",
      { cnaeCode: "6201501" },
    );
    expect(partial.score).toBeGreaterThan(0);
    expect(partial.score).toBeLessThan(40);
    expect(partial.label).not.toBe("Sem compatibilidade");
  });

  it("recomenda rubrica de TI para serviço de tecnologia", () => {
    const suggestion = recommendRubric({
      lines,
      serviceText: "Prestação de serviços de consultoria em TI",
      cnaeDescription: "Desenvolvimento de programas de computador",
      grossAmount: 600,
    });
    expect(suggestion?.lineId).toBe("ti");
    expect(suggestion!.score).toBeGreaterThan(0);
    expect(suggestion!.score).toBeLessThanOrEqual(100);
  });

  it("usa histórico do fornecedor como sinal forte", () => {
    const suggestion = recommendRubric({
      lines,
      serviceText: "serviço genérico",
      historyByLineId: { limpeza: 3, ti: 0 },
      grossAmount: 100,
    });
    expect(suggestion?.lineId).toBe("limpeza");
  });

  it("calcula limiar de recomendação em escala 0–100", () => {
    expect(adherenceRecommendThreshold(80)).toBe(60);
    expect(adherenceRecommendThreshold(0)).toBe(100);
  });
});
