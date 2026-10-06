import { describe, expect, it } from "vitest";
import { mapHeadersHeuristic, normalizeHeaderKey } from "@/lib/column-map";
import {
  normalizeRow,
  parseParticipacaoStatus,
  resolveParticipacaoFlags,
} from "@/lib/normalize";
import { emptySigaCulturalRow } from "@/lib/schema";

describe("parseParticipacaoStatus", () => {
  it("mapeia as 3 opções oficiais", () => {
    expect(parseParticipacaoStatus("Certificou")).toEqual({
      participante: 1,
      certificado: 1,
    });
    expect(parseParticipacaoStatus("Participou")).toEqual({
      participante: 1,
      certificado: 0,
    });
    expect(parseParticipacaoStatus("Não Participou")).toEqual({
      participante: 0,
      certificado: 0,
    });
  });

  it("aceita variações de acento/caixa", () => {
    expect(parseParticipacaoStatus("CERTIFICOU")).toEqual({
      participante: 1,
      certificado: 1,
    });
    expect(parseParticipacaoStatus("nao participou")).toEqual({
      participante: 0,
      certificado: 0,
    });
    expect(parseParticipacaoStatus("Não  Participou")).toEqual({
      participante: 0,
      certificado: 0,
    });
  });

  it("não interpreta flags legados 0/1", () => {
    expect(parseParticipacaoStatus("1")).toBeNull();
    expect(parseParticipacaoStatus("0")).toBeNull();
    expect(parseParticipacaoStatus("Sim")).toBeNull();
    expect(parseParticipacaoStatus("Não")).toBeNull();
  });
});

describe("normalizeRow + Participação", () => {
  it("divide Participação em Participantes e Certificado", () => {
    const cases: Array<[string, number, number]> = [
      ["Certificou", 1, 1],
      ["Participou", 1, 0],
      ["Não Participou", 0, 0],
    ];
    for (const [status, part, cert] of cases) {
      const row = normalizeRow({
        ...emptySigaCulturalRow({
          id_projeto: "P1",
          id_oficina: "O1",
          PROPONENTE: "X",
          PRONAC: "1",
          Nome_projeto: "Proj",
          Identificacao_ano_projeto: "2026",
        }),
        Nome: "Ana",
        CPF: "52998224725",
        Participantes: status,
      });
      expect(row.Participantes).toBe(part);
      expect(row.Certificado).toBe(cert);
    }
  });

  it("resolve campo bruto Participação", () => {
    expect(
      resolveParticipacaoFlags({ Participacao: "Certificou" }),
    ).toEqual({ Participantes: 1, Certificado: 1 });
    expect(
      resolveParticipacaoFlags({ "Participação": "Participou" }),
    ).toEqual({ Participantes: 1, Certificado: 0 });
  });

  it("mantém flags separados legados", () => {
    const row = normalizeRow({
      ...emptySigaCulturalRow({
        id_projeto: "P1",
        id_oficina: "O1",
        PROPONENTE: "X",
        PRONAC: "1",
        Nome_projeto: "Proj",
        Identificacao_ano_projeto: "2026",
      }),
      Nome: "Ana",
      CPF: "52998224725",
      Participantes: 1,
      Certificado: 0,
    });
    expect(row.Participantes).toBe(1);
    expect(row.Certificado).toBe(0);
  });
});

describe("column-map Participação", () => {
  it("normaliza cabeçalho e mapeia para Participantes", () => {
    expect(normalizeHeaderKey("Participação")).toBe("participacao");
    const mapped = mapHeadersHeuristic(
      ["Nome", "CPF", "Participação"],
      [
        {
          Nome: "Ana",
          CPF: "52998224725",
          Participação: "Certificou",
        },
        {
          Nome: "Bia",
          CPF: "39053344705",
          Participação: "Não Participou",
        },
      ],
    );
    expect(mapped.mapping["Participação"]).toBe("Participantes");
  });
});
