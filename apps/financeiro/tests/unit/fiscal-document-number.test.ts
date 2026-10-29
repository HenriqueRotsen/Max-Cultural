import { describe, expect, it } from "vitest";
import { pickFiscalDocumentNumber } from "@/lib/nf/extract";

describe("pickFiscalDocumentNumber DANFSe", () => {
  it("lê número em linha separada após rótulo NFS-e", () => {
    const text = `DANFSe
Número da NFS-e
3628
Valor do Serviço
R$ 2.432,00`;
    expect(pickFiscalDocumentNumber(text, "NF")).toBe("3628");
  });

  it("lê número do RPS", () => {
    const text = "Número do RPS\n4629\nValor bruto R$ 1.000,00";
    expect(pickFiscalDocumentNumber(text, "NF")).toBe("4629");
  });
});
