import { describe, expect, it } from "vitest";
import {
  applyParsedFullAddress,
  isFullAddressHeader,
  parseFullAddress,
} from "@/lib/address-parse";
import {
  dedupeNormalizedInscricaoRows,
  normalizeRow,
  parseFlexibleDateTime,
} from "@/lib/normalize";
import { emptySigaCulturalRow } from "@/lib/schema";

describe("parseFullAddress", () => {
  it("divide endereço Google Forms típico", () => {
    const parsed = parseFullAddress(
      "Rua Joaquim Galvão, 470, Céu Azul, Lagoa Grande Mg, Cep: 38755-000",
    );
    expect(parsed).toMatchObject({
      Lougradouro: "Rua Joaquim Galvão",
      Numero: "470",
      Bairro: "Céu Azul",
      Cidade: "Lagoa Grande",
      Estado: "MG",
      CEP: "38755000",
    });
  });

  it("reconhece cabeçalho Qual seu endereço completo", () => {
    expect(isFullAddressHeader("Qual seu endereço completo?")).toBe(true);
    expect(isFullAddressHeader("Informe seu endereço residencial")).toBe(true);
  });

  it("preenche campos vazios em normalizeRow", () => {
    const row = normalizeRow({
      ...emptySigaCulturalRow(),
      Nome: "Ana",
      CPF: "52998224725",
      Lougradouro:
        "Rua Joaquim Galvão, 470, Céu Azul, Lagoa Grande Mg, Cep: 38755-000",
    });
    expect(row.Lougradouro).toMatch(/^Rua Joaquim/);
    expect(row.Numero).toBe("470");
    expect(row.Bairro).toBe("Céu Azul");
    expect(row.Cidade).toBe("Lagoa Grande");
    expect(row.Estado).toBe("MG");
    expect(row.CEP).toBe("38755000");
  });

  it("não sobrescreve número já mapeado", () => {
    const merged = applyParsedFullAddress({
      Lougradouro: "Rua X, 10, Centro, BH MG, CEP 30100-000",
      Numero: "999",
      Bairro: "",
      Cidade: "",
      Estado: "",
      CEP: "",
    });
    expect(merged.Numero).toBe("999");
    expect(merged.Bairro).toBe("Centro");
  });
});

describe("dedupeNormalizedInscricaoRows", () => {
  it("mantém a resposta mais recente pelo carimbo", () => {
    const base = emptySigaCulturalRow({
      id_projeto: "P1",
      id_oficina: "O1",
      PROPONENTE: "X",
      PRONAC: "1",
      Nome_projeto: "Proj",
      Identificacao_ano_projeto: "2025",
    });
    const older = normalizeRow({
      ...base,
      Nome: "Ana",
      CPF: "52998224725",
      Data_inscricao: "01/10/2026",
      Telefone: "31999990000",
    });
    const newer = normalizeRow({
      ...base,
      Nome: "Ana Silva",
      CPF: "52998224725",
      Data_inscricao: "02/10/2026",
      Telefone: "31988887777",
    });
    const out = dedupeNormalizedInscricaoRows(
      [older, newer],
      ["01/10/2026 10:00:00", "02/10/2026 15:30:00"],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.Nome).toBe("Ana Silva");
    expect(out[0]?.Telefone).toBe("31988887777");
  });

  it("parseFlexibleDateTime preserva hora", () => {
    const d = parseFlexibleDateTime("28/09/2026 14:32:10");
    expect(d?.getHours()).toBe(14);
    expect(d?.getMinutes()).toBe(32);
  });
});
