import { describe, expect, it } from "vitest";
import { buildPlanningDocumentFilename } from "@/lib/nf/document-filename";

describe("document-filename", () => {
  it("monta nome identificável para NF", () => {
    const name = buildPlanningDocumentFilename({
      kind: "NF",
      projectCode: "257517",
      supplierName: "Henrique Rotsen Santos Ferreira",
      supplierDoc: "66.268.938/0001-03",
      hiredAt: "2026-07-07",
      amount: 600,
      originalFilename: "nota.pdf",
      mimeType: "application/pdf",
    });
    expect(name).toBe(
      "NF_257517_66268938000103_HENRIQUE-ROTSEN-SANTOS-FERREIRA_2026-07-07_R600-00.pdf",
    );
  });

  it("usa rótulo COMPROVANTE para proof", () => {
    const name = buildPlanningDocumentFilename({
      kind: "PAYMENT_PROOF",
      projectCode: "257517",
      originalFilename: "pix.png",
      mimeType: "image/png",
    });
    expect(name.startsWith("COMPROVANTE_257517")).toBe(true);
    expect(name.endsWith(".png")).toBe(true);
  });
});
