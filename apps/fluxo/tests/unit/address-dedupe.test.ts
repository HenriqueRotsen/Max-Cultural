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

describe("parseFullAddress (generalista)", () => {
  const cases: Array<[string, Partial<ReturnType<typeof parseFullAddress>>]> = [
    [
      "Rua Joaquim Galvão, 470, Céu Azul, Lagoa Grande Mg, Cep: 38755-000",
      {
        Lougradouro: "Rua Joaquim Galvão",
        Numero: "470",
        Bairro: "Céu Azul",
        Cidade: "Lagoa Grande",
        Estado: "MG",
        CEP: "38755000",
      },
    ],
    [
      "Av. Paulista, 1578 - Bela Vista - São Paulo/SP - CEP 01310-200",
      {
        Lougradouro: "Av. Paulista",
        Numero: "1578",
        Bairro: "Bela Vista",
        Cidade: "São Paulo",
        Estado: "SP",
        CEP: "01310200",
      },
    ],
    [
      "Rua das Flores 120, Centro, Belo Horizonte - MG, 30130-010",
      {
        Lougradouro: "Rua das Flores",
        Numero: "120",
        Bairro: "Centro",
        Cidade: "Belo Horizonte",
        Estado: "MG",
        CEP: "30130010",
      },
    ],
    [
      "Travessa São José nº 45, apto 302, Boa Viagem, Recife/PE CEP: 51020-000",
      {
        Lougradouro: "Travessa São José",
        Numero: "45",
        Complemento: "apto 302",
        Bairro: "Boa Viagem",
        Cidade: "Recife",
        Estado: "PE",
        CEP: "51020000",
      },
    ],
    [
      "Logradouro: Rua A; Número: 10; Bairro: Centro; Cidade: Contagem; UF: MG; CEP: 32210-000",
      {
        Lougradouro: "Rua A",
        Numero: "10",
        Bairro: "Centro",
        Cidade: "Contagem",
        Estado: "MG",
        CEP: "32210000",
      },
    ],
    [
      "Rua Sete de Setembro S/N, Centro, Curitiba, Paraná, 80020-010",
      {
        Lougradouro: "Rua Sete de Setembro",
        Numero: "S/N",
        Bairro: "Centro",
        Cidade: "Curitiba",
        Estado: "PR",
        CEP: "80020010",
      },
    ],
    [
      "Alameda Santos 700 Bela Vista São Paulo SP 01418-100",
      {
        Lougradouro: "Alameda Santos",
        Numero: "700",
        Bairro: "Bela Vista",
        Cidade: "São Paulo",
        Estado: "SP",
        CEP: "01418100",
      },
    ],
    [
      "R. XV de Novembro 1000, Centro - Curitiba/PR",
      {
        Lougradouro: "R. XV de Novembro",
        Numero: "1000",
        Bairro: "Centro",
        Cidade: "Curitiba",
        Estado: "PR",
      },
    ],
    [
      "Praça da Sé, s/n, Sé, São Paulo - SP",
      {
        Lougradouro: "Praça da Sé",
        Numero: "S/N",
        Bairro: "Sé",
        Cidade: "São Paulo",
        Estado: "SP",
      },
    ],
    [
      "Rodovia BR-040 Km 12, Zona Rural, Contagem, Minas Gerais",
      {
        Lougradouro: "Rodovia BR-040 Km 12",
        Bairro: "Zona Rural",
        Cidade: "Contagem",
        Estado: "MG",
      },
    ],
  ];

  it.each(cases)("parseia: %s", (input, expected) => {
    const parsed = parseFullAddress(input);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject(expected);
  });

  it("reconhece cabeçalhos variados", () => {
    expect(isFullAddressHeader("Qual seu endereço completo?")).toBe(true);
    expect(isFullAddressHeader("Informe seu endereço residencial")).toBe(true);
    expect(isFullAddressHeader("Onde você mora? (endereço)")).toBe(true);
    expect(isFullAddressHeader("Endereço com CEP")).toBe(true);
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
