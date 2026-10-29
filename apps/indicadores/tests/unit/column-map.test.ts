import { describe, expect, it } from "vitest";
import {
  mapHeadersHeuristic,
  normalizeHeaderKey,
  projectRowWithMapping,
} from "@/lib/column-map";
import type { BatchContext } from "@/lib/schema";

const ctx: BatchContext = {
  id_projeto: "1",
  id_oficina: "2",
  PROPONENTE: "Proponente",
  PRONAC: "257517",
  Nome_projeto: "Projeto",
  Identificacao_ano_projeto: "2025",
  Nome_oficina: "Oficina",
};

describe("column-map", () => {
  it("normaliza sinônimos de cabeçalho", () => {
    expect(normalizeHeaderKey("CPF")).toBe("cpf");
    expect(normalizeHeaderKey("E-mail")).toBe("e_mail");
    expect(normalizeHeaderKey("Nome Completo")).toBe("nome_completo");
    expect(normalizeHeaderKey("Nome completo ou nome social")).toBe(
      "nome_completo_ou_nome_social",
    );
  });

  it("mapeia 'Nome completo ou nome social' para Nome", () => {
    const result = mapHeadersHeuristic([
      "Nome completo ou nome social",
      "CPF",
      "Nome social",
    ]);
    expect(result.mapping["Nome completo ou nome social"]).toBe("Nome");
    expect(result.mapping["CPF"]).toBe("CPF");
    expect(result.mapping["Nome social"]).toBe("Apelido");
  });

  it("mapeia 'Carimbo de data/hora' para Data_inscricao", () => {
    expect(normalizeHeaderKey("Carimbo de data/hora")).toBe(
      "carimbo_de_data_hora",
    );
    const result = mapHeadersHeuristic([
      "Carimbo de data/hora",
      "Nome completo",
      "CPF",
    ]);
    expect(result.mapping["Carimbo de data/hora"]).toBe("Data_inscricao");
    expect(result.mapping["Nome completo"]).toBe("Nome");
  });

  it("projeta linha com mapping", () => {
    const mapping = {
      cpf: "CPF" as const,
      nome_completo: "Nome" as const,
      "e-mail": "E-mail" as const,
    };
    const row = projectRowWithMapping(
      { cpf: "529.982.247-25", nome_completo: "Ana", "e-mail": "ana@x.com" },
      mapping,
      ctx,
    );
    expect(row.CPF).toBe("529.982.247-25");
    expect(row.Nome).toBe("Ana");
    expect(row["E-mail"]).toBe("ana@x.com");
    expect(row.PRONAC).toBe("257517");
  });
});
