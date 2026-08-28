import { describe, expect, it } from "vitest";
import {
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
});
