import { describe, expect, it } from "vitest";
import { hashDocumentContent } from "@/lib/nf/document-hash";
import { parseProducerSheet } from "@/lib/planning/producer-sheet";
import type { RubricCandidate } from "@/lib/planning/recommend-rubric";

describe("document-hash", () => {
  it("produces stable sha256 hex", () => {
    const a = hashDocumentContent(Buffer.from("hello"));
    const b = hashDocumentContent(Buffer.from("hello"));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe("parseProducerSheet", () => {
  const candidates: RubricCandidate[] = [
    {
      id: "line-1",
      itemName: "Locação de som",
      stageName: "Pré-produção",
      productName: "Produto",
      city: "São Paulo",
      state: "SP",
      categoryHint: "equipamento",
      available: 5000,
    },
  ];

  it("parses csv rows with item and valor", () => {
    const csv = "Item,Valor,Fornecedor,CNPJ\nLocação de som,1500,Acme,12345678000199\n";
    const rows = parseProducerSheet(Buffer.from(csv), "planilha.csv", candidates);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(1500);
    expect(rows[0]!.supplier).toBe("Acme");
    expect(rows[0]!.suggestedLineId).toBe("line-1");
  });
});
