import { describe, expect, it } from "vitest";
import {
  ONLINE_TERRITORIO_LABEL,
  applyTerritorioAcaoFormToSiga,
  buildAcaoTerritorioOpcoes,
  acaoTerritorioLabel,
  parseTerritorioInscricao,
  resolveAcaoTerritorioChoice,
  territorioAcaoFieldMeta,
  territorioAcaoStructuredMeta,
  type AcaoTerritorioCatalog,
} from "@/lib/acao-territorio";
import { mapHeadersHeuristic, normalizeHeaderKey } from "@/lib/column-map";
import { normalizeRow } from "@/lib/normalize";
import type { BatchContext } from "@/lib/schema";

const catalog: AcaoTerritorioCatalog = {
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
      acaoTerritorioId: "t1",
    },
  ],
};

describe("acaoTerritorioLabel", () => {
  it("monta labels canônicos", () => {
    expect(
      acaoTerritorioLabel({
        cidade: "Imperatriz",
        estado: "MA",
        nome: "Quilombo X",
      }),
    ).toBe("Imperatriz/MA · Quilombo X");
    expect(
      acaoTerritorioLabel({ cidade: "São Luís", estado: "MA", nome: "" }),
    ).toBe("São Luís/MA");
  });
});

describe("buildAcaoTerritorioOpcoes / field meta", () => {
  it("une Online + territórios presenciais", () => {
    const opts = buildAcaoTerritorioOpcoes(catalog);
    expect(opts[0]).toBe(ONLINE_TERRITORIO_LABEL);
    expect(opts).toContain("Imperatriz/MA · Quilombo X");
    expect(opts).toContain("São Luís/MA");
  });

  it("só online → autoChoice, sem campo", () => {
    const meta = territorioAcaoFieldMeta({
      ofereceOnline: true,
      oferecePresencial: false,
      territorios: [],
    });
    expect(meta.showField).toBe(false);
    expect(meta.obrigatorio).toBe(false);
    expect(meta.autoChoice).toBe("Online");
  });

  it("2+ opções → pergunta obrigatória", () => {
    const meta = territorioAcaoFieldMeta(catalog);
    expect(meta.showField).toBe(true);
    expect(meta.obrigatorio).toBe(true);
    expect(meta.opcoes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("territorioAcaoStructuredMeta / form value", () => {
  it("online+presencial → escolha de modalidade", () => {
    const meta = territorioAcaoStructuredMeta(catalog);
    expect(meta.autoModalidade).toBeNull();
    expect(meta.ofereceOnline).toBe(true);
    expect(meta.oferecePresencial).toBe(true);

    const siga: Record<string, unknown> = {};
    applyTerritorioAcaoFormToSiga(
      siga,
      {
        modalidade: "PRESENCIAL",
        cidade: "Imperatriz",
        estado: "MA",
        territorio: "Quilombo X",
      },
      catalog,
    );
    expect(siga.Cidade).toBe("Imperatriz");
    expect(siga.Estado).toBe("MA");
    expect(siga.Territorio).toBe("Quilombo X");
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
    expect(byLabel.acaoTerritorioId).toBe("t1");
    expect(byLabel.cidade).toBe("Imperatriz");
    expect(byLabel.territorio).toBe("Quilombo X");

    const byCity = parseTerritorioInscricao("São Luís", catalog);
    expect(byCity.matched).toBe(true);
    expect(byCity.acaoTerritorioId).toBe("t2");
  });

  it("usa alias", () => {
    const r = parseTerritorioInscricao("Imperatriz Quilombo", catalog);
    expect(r.matched).toBe(true);
    expect(r.acaoTerritorioId).toBe("t1");
  });

  it("resolve choice Online", () => {
    const r = resolveAcaoTerritorioChoice("Online", catalog);
    expect(r.online).toBe(true);
    expect(r.matched).toBe(true);
  });

  it("parseia agenda Cultura na Praça (cidade + comunidade + UF + datas)", () => {
    const a = parseTerritorioInscricao(
      "Açailândia (assentamento Novo Oriente) – Ma: 20 A 23 De Julho",
    );
    expect(a.matched).toBe(true);
    expect(a.online).toBe(false);
    expect(a.cidade).toBe("Açailândia");
    expect(a.estado).toBe("MA");
    expect(a.territorio).toBe("Assentamento Novo Oriente");

    const b = parseTerritorioInscricao(
      "Canaã Dos Carajás – Pa: 11 A 14 De Julho",
    );
    expect(b.matched).toBe(true);
    expect(b.online).toBe(false);
    expect(b.cidade).toMatch(/Canaã Dos Carajás/i);
    expect(b.estado).toBe("PA");
    expect(b.territorio).toBe("");
  });
});

describe("column-map território da ação", () => {
  it("mapeia pergunta «qual oficina?» (planilhas antigas) para Territorio", () => {
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

  it("mapeia pergunta «qual ação?» para Territorio", () => {
    expect(normalizeHeaderKey("Você quer se inscrever para qual ação?")).toBe(
      "voce_quer_se_inscrever_para_qual_acao",
    );
    const result = mapHeadersHeuristic([
      "Você quer se inscrever para qual ação?",
      "Nome completo",
      "CPF",
    ]);
    expect(result.mapping["Você quer se inscrever para qual ação?"]).toBe(
      "Territorio",
    );
  });
});

describe("normalizeRow com catálogo", () => {
  it("aplica match de território da ação", () => {
    const ctx: BatchContext = {
      id_projeto: "1",
      id_oficina: "2",
      PROPONENTE: "P",
      PRONAC: "1",
      Nome_projeto: "Proj",
      Identificacao_ano_projeto: "2025",
      Nome_oficina: "Of",
      acaoTerritorioCatalog: catalog,
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
