import { describe, expect, it } from "vitest";
import {
  ONLINE_TERRITORIO_LABEL,
  buildOficinaTerritorioOpcoes,
  oficinaTerritorioLabel,
  parseTerritorioInscricao,
  resolveOficinaTerritorioChoice,
  territorioOficinaFieldMeta,
  type OficinaTerritorioCatalog,
} from "@/lib/oficina-territorio";
import { mapHeadersHeuristic, normalizeHeaderKey } from "@/lib/column-map";
import { normalizeRow } from "@/lib/normalize";
import type { BatchContext } from "@/lib/schema";

const catalog: OficinaTerritorioCatalog = {
  ofereceOnline: true,
  oferecePresencial: true,
  territorios: [
    {
      id: "t1",
      nome: "Quilombo X",
      cidade: "Imperatriz",
      estado: "MA",
    },
    {
      id: "t2",
      nome: "",
      cidade: "São Luís",
      estado: "MA",
    },
  ],
  aliases: [
    {
      rawNormalized: "imperatriz quilombo",
      online: false,
      oficinaTerritorioId: "t1",
    },
  ],
};

describe("oficinaTerritorioLabel", () => {
  it("monta labels canônicos", () => {
    expect(
      oficinaTerritorioLabel({
        cidade: "Imperatriz",
        estado: "MA",
        nome: "Quilombo X",
      }),
    ).toBe("Imperatriz/MA · Quilombo X");
    expect(
      oficinaTerritorioLabel({ cidade: "São Luís", estado: "MA", nome: "" }),
    ).toBe("São Luís/MA");
  });
});

describe("buildOficinaTerritorioOpcoes / field meta", () => {
  it("une Online + territórios presenciais", () => {
    const opts = buildOficinaTerritorioOpcoes(catalog);
    expect(opts[0]).toBe(ONLINE_TERRITORIO_LABEL);
    expect(opts).toContain("Imperatriz/MA · Quilombo X");
    expect(opts).toContain("São Luís/MA");
  });

  it("só online → autoChoice, sem campo", () => {
    const meta = territorioOficinaFieldMeta({
      ofereceOnline: true,
      oferecePresencial: false,
      territorios: [],
    });
    expect(meta.showField).toBe(false);
    expect(meta.obrigatorio).toBe(false);
    expect(meta.autoChoice).toBe("Online");
  });

  it("2+ opções → pergunta obrigatória", () => {
    const meta = territorioOficinaFieldMeta(catalog);
    expect(meta.showField).toBe(true);
    expect(meta.obrigatorio).toBe(true);
    expect(meta.opcoes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("parseTerritorioInscricao", () => {
  it("reconhece online", () => {
    const r = parseTerritorioInscricao("Aulão Online", catalog);
    expect(r.matched).toBe(true);
    expect(r.online).toBe(true);
    expect(r.territorio).toBe("Online");
  });

  it("casa label canônico e município", () => {
    const byLabel = parseTerritorioInscricao(
      "Imperatriz/MA · Quilombo X",
      catalog,
    );
    expect(byLabel.matched).toBe(true);
    expect(byLabel.oficinaTerritorioId).toBe("t1");
    expect(byLabel.cidade).toBe("Imperatriz");
    expect(byLabel.territorio).toBe("Quilombo X");

    const byCity = parseTerritorioInscricao("São Luís", catalog);
    expect(byCity.matched).toBe(true);
    expect(byCity.oficinaTerritorioId).toBe("t2");
  });

  it("usa alias", () => {
    const r = parseTerritorioInscricao("Imperatriz Quilombo", catalog);
    expect(r.matched).toBe(true);
    expect(r.oficinaTerritorioId).toBe("t1");
  });

  it("resolve choice Online", () => {
    const r = resolveOficinaTerritorioChoice("Online", catalog);
    expect(r.online).toBe(true);
    expect(r.matched).toBe(true);
  });
});

describe("column-map território da oficina", () => {
  it("mapeia pergunta «qual oficina?» para Territorio", () => {
    expect(
      normalizeHeaderKey("Você quer se inscrever para qual oficina?"),
    ).toBe("voce_quer_se_inscrever_para_qual_oficina");
    const result = mapHeadersHeuristic([
      "Você quer se inscrever para qual oficina?",
      "Nome completo",
      "CPF",
    ]);
    expect(result.mapping["Você quer se inscrever para qual oficina?"]).toBe(
      "Territorio",
    );
  });
});

describe("normalizeRow com catálogo", () => {
  it("aplica match de território da oficina", () => {
    const ctx: BatchContext = {
      id_projeto: "1",
      id_oficina: "2",
      PROPONENTE: "P",
      PRONAC: "1",
      Nome_projeto: "Proj",
      Identificacao_ano_projeto: "2025",
      Nome_oficina: "Of",
      oficinaTerritorioCatalog: catalog,
    };
    const row = normalizeRow(
      {
        Nome: "Ana",
        CPF: "52998224725",
        Territorio: "Online",
      },
      ctx,
    );
    expect(row.Territorio).toBe("Online");
    expect(row.Cidade).toBe("");
  });
});
