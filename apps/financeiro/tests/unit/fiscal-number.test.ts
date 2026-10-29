import { describe, expect, it } from "vitest";
import {
  extractFiscalNumbersFromText,
  normalizeFiscalNumber,
} from "@/lib/nf/fiscal-number";

describe("fiscal-number", () => {
  it("extrai RPA com número/ano", () => {
    const text =
      "RECIBO DE PAGAMENTO A AUTÔNOMO - RPA - N9 026/2026\nR$ 300,00";
    expect(extractFiscalNumbersFromText(text, "RPA").fiscalNumber).toBe("26/2026");
  });

  it("normaliza RPA removendo zero à esquerda", () => {
    expect(normalizeFiscalNumber("026/2026", "RPA")).toBe("26/2026");
  });

  it("extrai NFS-e e RPS separados", () => {
    const text = `Número da NFS-e
3628
Número do RPS
1234`;
    const nums = extractFiscalNumbersFromText(text, "NF");
    expect(nums.fiscalNumber).toBe("3628");
    expect(nums.nfseNumber).toBe("3628");
    expect(nums.rpsNumber).toBe("1234");
  });

  it("usa RPS só se NFS-e ausente", () => {
    const text = "Número do RPS\n5678";
    const nums = extractFiscalNumbersFromText(text, "NF");
    expect(nums.fiscalNumber).toBe("5678");
    expect(nums.nfseNumber).toBeNull();
    expect(nums.rpsNumber).toBe("5678");
  });
});
