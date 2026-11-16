import { describe, expect, it } from "vitest";
import {
  pickFiscalDocumentNumber,
  pickPaymentDocumentNumber,
  pickPaymentProofDate,
} from "@/lib/nf/extract";
import {
  buildSalicUploadFilename,
  buildSalicUploadFilenameForRow,
  resolveFiscalDocumentNumber,
  resolvePaymentDate,
  resolvePaymentDocumentNumber,
} from "@/lib/salic/salic-publish-metadata";

describe("salic-publish-metadata", () => {
  it("monta nome do arquivo no padrão SALIC", () => {
    expect(
      buildSalicUploadFilename({
        itemNumber: 139,
        docLabel: "NF",
        fiscalDocNumber: "29",
        supplierName: "Rayane Silva",
      }),
    ).toBe("139- NF 29- Rayane Silva.pdf");
  });

  it("RPA com barra no número e fornecedor com acento", () => {
    expect(
      buildSalicUploadFilename({
        itemNumber: 42,
        docLabel: "RPA",
        fiscalDocNumber: "26/2026",
        supplierName: "GMC Assessoria Contábil Ltda",
      }),
    ).toBe("42- RPA 26-2026- GMC Assessoria Contabil Ltda.pdf");
  });

  it("lista de reservas: sem NF usa tipo e número do documento de apoio", () => {
    expect(
      buildSalicUploadFilenameForRow({
        sortOrder: 1,
        supplierName: "Grafica Teste",
        fiscalKind: null,
        docLabel: "Apolice",
        docNumber: "1007500012345",
      }),
    ).toBe("2- Apolice 1007500012345- Grafica Teste.pdf");
  });

  it("sem número vira S-N", () => {
    expect(
      buildSalicUploadFilename({
        itemNumber: 5,
        docLabel: "Apolice",
        fiscalDocNumber: "S/N",
        supplierName: "Seguradora X",
      }),
    ).toBe("5- Apolice S-N- Seguradora X.pdf");
  });

  it("usa número da NF/RPA extraído", () => {
    expect(
      resolveFiscalDocumentNumber(
        { nfNumber: "3628" },
        "NF",
      ),
    ).toBe("3628");
    expect(
      resolveFiscalDocumentNumber(
        { invoiceNumber: "4629" },
        "RPA",
      ),
    ).toBe("4629");
  });

  it("prioriza TED do comprovante sobre dados bancários da NF", () => {
    expect(
      resolvePaymentDocumentNumber({
        proofExtracted: { paymentDocumentNumber: "1234567890" },
        fiscalExtracted: {
          payment: { bankAccount: "99999-9" },
        },
      }),
    ).toBe("1234567890");
  });

  it("usa data do comprovante em vez da data de hoje", () => {
    const date = resolvePaymentDate({
      proofExtracted: { paymentDate: "2026-07-20" },
      paidAt: new Date("2026-08-31T12:00:00Z"),
    });
    expect(date.toISOString().slice(0, 10)).toBe("2026-07-20");
  });
});

describe("extract payment/fiscal numbers", () => {
  it("extrai número da NFS-e", () => {
    const text = "Número da NFS-e\n3628\nValor do Serviço\nR$ 2.432,00";
    expect(pickFiscalDocumentNumber(text, "NF")).toBe("3628");
  });

  it("extrai número do RPA", () => {
    const text = "Recibo de Pagamento Autônomo nº 4629\nValor bruto R$ 1.000,00";
    expect(pickFiscalDocumentNumber(text, "RPA")).toBe("4629");
  });

  it("extrai TED e data do comprovante", () => {
    const text =
      "Comprovante de Transferência\nTED\nData da transação 20/07/2026\nNúmero do documento 9876543210";
    expect(pickPaymentDocumentNumber(text)).toBe("9876543210");
    expect(pickPaymentProofDate(text)).toBe("2026-07-20");
  });
});
