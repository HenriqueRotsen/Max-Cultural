import { describe, expect, it } from "vitest";
import {
  applyTerritorioToContext,
  distinctTerritorioValues,
  initialTerritorioState,
  territorioAliasesFromState,
  territorioOpcoes,
  territorioPendencia,
} from "@/lib/import-territorio";
import { normalizeRow } from "@/lib/normalize";
import type { OficinaTerritorioCatalog } from "@/lib/oficina-territorio";
import type { BatchContext } from "@/lib/schema";

const catalog: OficinaTerritorioCatalog = {
  ofereceOnline: true,
  oferecePresencial: true,
  territorios: [
    { id: "t1", nome: "Quilombo X", cidade: "Imperatriz", estado: "MA" },
    { id: "t2", nome: "", cidade: "São Luís", estado: "MA" },
  ],
};

const baseContext: BatchContext = {
  id_projeto: "1",
  id_oficina: "9",
  PROPONENTE: "Vivas",
  PRONAC: "",
  Nome_projeto: "Arte em Rede",
  Identificacao_ano_projeto: "2026",
  Nome_oficina: "Oficina",
  oficinaTerritorioCatalog: catalog,
};

const LABEL_T1 = "Imperatriz/MA · Quilombo X";
const LABEL_T2 = "São Luís/MA";

describe("território no import", () => {
  it("lista valores distintos e conta linhas em branco", () => {
    const { values, blankCount } = distinctTerritorioValues(
      [{ T: "Comunidade A" }, { T: "comunidade a " }, { T: "" }, { T: "Centro" }],
      ["T"],
    );
    expect(values).toEqual([
      { raw: "Comunidade A", count: 2 },
      { raw: "Centro", count: 1 },
    ]);
    expect(blankCount).toBe(1);
  });

  it("oficina com uma só opção: vale para o lote todo", () => {
    const single: OficinaTerritorioCatalog = {
      ofereceOnline: false,
      oferecePresencial: true,
      territorios: [catalog.territorios[1]!],
    };
    const st = initialTerritorioState(single, [{ raw: "qualquer", count: 3 }]);
    expect(st).toEqual({ modo: "lote", lote: LABEL_T2, mapa: {} });
    expect(territorioPendencia(st, territorioOpcoes(single), [], 0)).toBeNull();
  });

  it("oficina sem território bloqueia", () => {
    const vazio: OficinaTerritorioCatalog = {
      ofereceOnline: false,
      oferecePresencial: true,
      territorios: [],
    };
    const st = initialTerritorioState(vazio, []);
    expect(territorioPendencia(st, territorioOpcoes(vazio), [], 0)).toMatch(/não tem território/);
  });

  it("sugere o que já casa e exige ligar o resto (planilha não cria território)", () => {
    const values = [
      { raw: "Online", count: 2 },
      { raw: "Comunidade A", count: 1 },
    ];
    const st = initialTerritorioState(catalog, values);
    expect(st.modo).toBe("planilha");
    expect(st.mapa).toEqual({ Online: "Online" });
    const opcoes = territorioOpcoes(catalog);
    expect(territorioPendencia(st, opcoes, values, 0)).toMatch(/Ligue 1 valor/);

    const ligado = { ...st, mapa: { ...st.mapa, "Comunidade A": LABEL_T1 } };
    expect(territorioPendencia(ligado, opcoes, values, 0)).toBeNull();
    expect(territorioPendencia(ligado, opcoes, values, 2)).toMatch(/sem território/);
    expect(territorioAliasesFromState(ligado, catalog, values)).toEqual([
      { raw: "Online", online: true, oficinaTerritorioId: null },
      { raw: "Comunidade A", online: false, oficinaTerritorioId: "t1" },
    ]);
  });

  it("modo planilha: valor ligado vira o território da oficina; vazio usa o lote", () => {
    const values = [{ raw: "Comunidade A", count: 1 }];
    const ctx = applyTerritorioToContext(
      baseContext,
      { modo: "planilha", lote: LABEL_T2, mapa: { "Comunidade A": LABEL_T1 } },
      values,
    );
    const ligado = normalizeRow({ Nome: "Ana", CPF: "", Territorio: "Comunidade A" }, ctx);
    expect([ligado.Cidade, ligado.Estado, ligado.Territorio]).toEqual([
      "Imperatriz",
      "MA",
      "Quilombo X",
    ]);
    const vazio = normalizeRow({ Nome: "Bia", CPF: "", Territorio: "" }, ctx);
    expect([vazio.Cidade, vazio.Estado]).toEqual(["São Luís", "MA"]);
  });

  it("modo lote: ignora a coluna da planilha", () => {
    const ctx = applyTerritorioToContext(
      baseContext,
      { modo: "lote", lote: LABEL_T1, mapa: {} },
      [{ raw: "Outro lugar", count: 1 }],
    );
    const row = normalizeRow({ Nome: "Ana", CPF: "", Territorio: "Outro lugar" }, ctx);
    expect([row.Cidade, row.Territorio]).toEqual(["Imperatriz", "Quilombo X"]);
  });
});
