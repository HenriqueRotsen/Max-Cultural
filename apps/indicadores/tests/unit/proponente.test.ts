import { describe, expect, it } from "vitest";
import {
  agruparProponentes,
  isProponenteDeTeste,
  nomeCanonico,
  possiveisDuplicados,
  proponenteKey,
  proponenteKeyBase,
} from "@/lib/proponente";

describe("proponenteKey", () => {
  it("ignora sufixo jurídico, acento, caixa, pontuação e CNPJ", () => {
    const k = proponenteKey("Vivas Cultura e Esporte");
    expect(proponenteKey("Vivas Cultura e Esporte LTDA")).toBe(k);
    expect(proponenteKey("VIVAS CULTURA E ESPORTE LTDA.")).toBe(k);
    expect(proponenteKey("Vivas Cultura e Esporte Ltda - ME")).toBe(k);
    expect(proponenteKey("Vivas Cultura e Esporte LTDA (CNPJ 12.345.678/0001-90)")).toBe(k);
    expect(proponenteKey("Vivas Cultura e Esporte S/A")).toBe(k);
    expect(proponenteKeyBase("Associação Cultural Ação")).toBe("associacao cultural acao");
  });

  it("junta apelidos confirmados", () => {
    expect(proponenteKey("Instituto Vivas")).toBe(proponenteKey("Instituto Morada Vivas"));
    expect(proponenteKey("ATELIÊ 22")).toBe(proponenteKey("ATELIE 22 - ARTE E CULTURA LTDA"));
    expect(
      agruparProponentes([
        { nome: "ATELIÊ 22", usos: 5 },
        { nome: "ATELIE 22 - ARTE E CULTURA LTDA", usos: 1 },
      ]).grupos.map((g) => g.nome),
    ).toEqual(["ATELIE 22 - ARTE E CULTURA LTDA"]);
  });

  it("não junta nomes diferentes", () => {
    expect(proponenteKey("Instituto Vivas")).not.toBe(proponenteKey("Vivas Cultura e Esporte"));
    expect(proponenteKey("ME Produções")).toBe("me producoes");
  });
});

describe("agruparProponentes", () => {
  it("escolhe o nome mais completo e deixa os de teste de fora", () => {
    const { grupos, teste } = agruparProponentes([
      { nome: "Vivas Cultura e Esporte", usos: 30 },
      { nome: "Vivas Cultura e Esporte LTDA", usos: 3 },
      { nome: "Instituto Vivas", usos: 10 },
      { nome: "Instituto Morada Vivas", usos: 2 },
      { nome: "Proponente Teste", usos: 1 },
    ]);
    expect(grupos.map((g) => g.nome)).toEqual([
      "Instituto Morada Vivas",
      "Vivas Cultura e Esporte LTDA",
    ]);
    expect(teste.map((t) => t.nome)).toEqual(["Proponente Teste"]);
  });

  it("nomeCanonico desempata pelo mais usado", () => {
    expect(
      nomeCanonico([
        { nome: "Associação Demo", usos: 1 },
        { nome: "ASSOCIACAO DEMO", usos: 5 },
      ]),
    ).toBe("ASSOCIACAO DEMO");
  });

  it("aponta possíveis duplicados para revisão", () => {
    const { grupos } = agruparProponentes([
      { nome: "Casa Lumiar", usos: 1 },
      { nome: "Instituto Casa Lumiar", usos: 1 },
      { nome: "Outro Coletivo", usos: 1 },
    ]);
    expect(possiveisDuplicados(grupos)).toEqual([["Casa Lumiar", "Instituto Casa Lumiar"]]);
  });
});

describe("isProponenteDeTeste", () => {
  it("reconhece nomes de teste", () => {
    expect(isProponenteDeTeste("Teste")).toBe(true);
    expect(isProponenteDeTeste("proponente demo")).toBe(true);
    expect(isProponenteDeTeste("Vivas Cultura e Esporte")).toBe(false);
    expect(isProponenteDeTeste("Contestado Produções")).toBe(false);
  });
});
