import { describe, expect, it } from "vitest";
import {
  buildSalicComprovantePayload,
  formatSalicBrDate,
  mapSalicDocumentTipo,
  mapSalicPaymentForm,
} from "@/lib/salic/salic-publish-payload";

describe("salic-publish-payload", () => {
  it("mapeia tipo NF merged e RPA", () => {
    expect(mapSalicDocumentTipo("NF", true)).toBe(3);
    expect(mapSalicDocumentTipo("RPA", true)).toBe(5);
    expect(mapSalicDocumentTipo(null, false)).toBe(4);
  });

  it("mapeia forma de pagamento", () => {
    expect(mapSalicPaymentForm("Transferencia Bancaria")).toBe(2);
    expect(mapSalicPaymentForm("Cheque")).toBe(1);
    expect(mapSalicPaymentForm("Saque/Dinheiro")).toBe(3);
  });

  it("monta payload nacional com planilhaAprovacaoId", () => {
    const payload = buildSalicComprovantePayload({
      supplierCnpjCpf: "66268938000103",
      supplierName: "HENRIQUE ROTSEN",
      idAgente: 12345,
      planilhaAprovacaoId: "987654",
      fiscalKind: "NF",
      mergedWithFiscal: true,
      documentNumber: "123",
      paymentDocumentNumber: "999",
      amount: 400,
      issueDate: new Date("2025-06-15T12:00:00Z"),
      paymentDate: new Date("2025-06-20T12:00:00Z"),
    });

    expect(payload.idPlanilhaAprovacao).toBe(987654);
    expect(payload.tipo).toBe(3);
    expect(payload.forma).toBe(2);
    expect(payload.fornecedor.tipoPessoa).toBe(2);
    expect(payload.dataEmissao).toBe(formatSalicBrDate(new Date("2025-06-15T12:00:00Z")));
    expect(payload.valor).toBe(400);
  });

  it("rejeita rubrica sem planilhaAprovacaoId", () => {
    expect(() =>
      buildSalicComprovantePayload({
        supplierCnpjCpf: "12345678901",
        supplierName: "PF",
        idAgente: 1,
        planilhaAprovacaoId: "",
        fiscalKind: null,
        mergedWithFiscal: false,
        documentNumber: "1",
        paymentDocumentNumber: "0",
        amount: 10,
        issueDate: new Date(),
        paymentDate: new Date(),
      }),
    ).toThrow(/idPlanilhaAprovacao/);
  });
});
