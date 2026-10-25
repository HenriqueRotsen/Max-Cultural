import { describe, expect, it } from "vitest";
import { compareSheets, type CompareLineInput } from "@/lib/planning/sheet-compare";

const line = (id: string | null, item: string, amount: number, extra: Partial<CompareLineInput> = {}) => ({
  planilhaAprovacaoId: id,
  fonteRecurso: "Incentivo",
  productName: "Festival",
  stageName: "Produção",
  state: "MG",
  city: "Belo Horizonte",
  itemName: item,
  amount,
  ...extra,
});

describe("compareSheets (homologada × readequada)", () => {
  it("casa por id e marca igual, alterada, nova e removida", () => {
    const rows = compareSheets(
      [line("1", "Cachê", 1000), line("2", "Som", 500), line("3", "Luz", 300)],
      [line("1", "Cachê", 1000), line("2", "Som", 800), line("9", "Transporte", 200)],
    );
    const by = Object.fromEntries(rows.map((r) => [r.itemName, r]));
    expect(by["Cachê"]).toMatchObject({ status: "IGUAL", diff: 0 });
    expect(by["Som"]).toMatchObject({ status: "ALTERADA", before: 500, after: 800, diff: 300 });
    expect(by["Transporte"]).toMatchObject({ status: "NOVA", before: null, after: 200 });
    expect(by["Luz"]).toMatchObject({ status: "REMOVIDA", before: 300, after: null, diff: -300 });
  });

  it("se a readequação trocou os ids, casa pelo produto/etapa/local/item", () => {
    const rows = compareSheets([line("10", "Cachê", 1000)], [line("77", "Cachê", 1200)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "ALTERADA", before: 1000, after: 1200 });
  });
});
