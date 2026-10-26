import { describe, expect, it } from "vitest";
import { fixSalicEncoding, sanitizeSalicText } from "@/lib/salic/text";

describe("textos do SALIC", () => {
  it("troca controles Windows-1252 pelo caractere certo", () => {
    expect(fixSalicEncoding("CULTURA NA PRAÇA \u0096 3ª EDIÇÃO")).toBe("CULTURA NA PRAÇA – 3ª EDIÇÃO");
    expect(fixSalicEncoding("\u0093Arte\u0094")).toBe("“Arte”");
  });

  it("desfaz UTF-8 lido como Latin-1, inclusive duas vezes", () => {
    expect(fixSalicEncoding("REC 2745079-RESCISÃ\u0083O")).toBe("REC 2745079-RESCISÃO");
    expect(fixSalicEncoding("NF 02-2Ã\u0082Âª  PARCELA")).toBe("NF 02-2ª  PARCELA");
    expect(fixSalicEncoding("TRCT SNÃ\u0082Âº-INSS")).toBe("TRCT SNº-INSS");
    // "–" em UTF-8 (E2 80 93) lido como Latin-1, uma e duas vezes.
    expect(fixSalicEncoding("RPA 021 \u00e2\u0080\u0093 ELSON")).toBe("RPA 021 – ELSON");
    expect(fixSalicEncoding("RPA 041/2023 Ã¢Â\u0080Â\u0093LENA")).toBe("RPA 041/2023 –LENA");
  });

  it("não mexe em texto já correto", () => {
    for (const ok of ["EDIÇÃO 2026", "Ação – “cultura”", "São Luís/MA", "Âncora"]) {
      expect(fixSalicEncoding(ok)).toBe(ok);
    }
  });

  it("sanitizeSalicText aplica a correção", () => {
    expect(sanitizeSalicText("Festa \u0096 <b>2ª</b> edição")).toBe("Festa – 2ª edição");
  });
});
