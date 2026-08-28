import { describe, expect, it } from "vitest";
import {
  amountsClose,
  checkPaymentAmount,
  checkProjectCodeInDocument,
  checkTaxProofAgainstNf,
  findProjectCodesInText,
} from "@/lib/nf/document-cross-check";

describe("document-cross-check", () => {
  it("encontra PRONAC no texto", () => {
    expect(findProjectCodesInText("Serviço para PRONAC 257517 no teatro")).toEqual([
      "257517",
    ]);
  });

  it("avisa quando projeto do documento difere do esperado", () => {
    const result = checkProjectCodeInDocument({
      text: "Prestação de serviços — PRONAC 123456",
      expectedCode: "257517",
    });
    expect(result.warning).toMatch(/123456/);
    expect(result.warning).toMatch(/257517/);
  });

  it("não avisa quando projeto bate", () => {
    const result = checkProjectCodeInDocument({
      text: "Projeto 257517 — montagem de cenário",
      expectedCode: "257517",
    });
    expect(result.warning).toBeUndefined();
  });

  it("bloqueia valor de pagamento diferente da NF", () => {
    const result = checkPaymentAmount({
      extractedAmount: 500,
      expectedAmount: 600,
    });
    expect(result.error).toMatch(/500/);
    expect(result.error).toMatch(/600/);
  });

  it("aceita valor próximo da NF", () => {
    const result = checkPaymentAmount({
      extractedAmount: 599.99,
      expectedAmount: 600,
    });
    expect(result.error).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  it("avisa quando não lê valor no comprovante", () => {
    const result = checkPaymentAmount({
      extractedAmount: null,
      expectedAmount: 600,
    });
    expect(result.warning).toMatch(/Não foi possível ler/);
  });

  it("bloqueia impostos divergentes da NF", () => {
    const result = checkTaxProofAgainstNf({
      extractedTaxes: { iss: 10, irrf: 5 },
      expectedTaxes: { iss: 10, irrf: 6 },
      expectedTaxTotal: 16,
    });
    expect(result.error).toMatch(/IRRF/);
  });

  it("amountsClose tolera centavos", () => {
    expect(amountsClose(100.01, 100)).toBe(true);
    expect(amountsClose(100.05, 100)).toBe(false);
  });
});
