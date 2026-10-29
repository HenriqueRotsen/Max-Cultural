import { describe, expect, it } from "vitest";
import { buildSalicPublishPackages } from "@/lib/planning/salic-publish-packages";

function doc(
  partial: Partial<{
    id: string;
    kind: string;
    status: string;
    filename: string;
    sourceDocumentId: string | null;
    salicComprovanteId: string | null;
    salicPublishMode: string | null;
    salicRepublishPending: boolean;
  }>,
) {
  return {
    id: partial.id ?? "doc",
    kind: partial.kind ?? "PAYMENT_PROOF",
    status: partial.status ?? "IMPORTED",
    filename: partial.filename ?? "file.pdf",
    mimeType: "application/pdf",
    storagePath: "/tmp/x",
    sourceDocumentId: partial.sourceDocumentId ?? null,
    salicComprovanteId: partial.salicComprovanteId ?? null,
    salicPublishMode: partial.salicPublishMode ?? null,
    salicRepublishPending: partial.salicRepublishPending ?? false,
  };
}

describe("buildSalicPublishPackages", () => {
  it("envia NF/RPA + comprovante como um pacote merged", () => {
    const packages = buildSalicPublishPackages([
      doc({ id: "nf1", kind: "NF", filename: "nf.pdf" }),
      doc({
        id: "p1",
        kind: "PAYMENT_PROOF",
        filename: "comp.pdf",
        sourceDocumentId: "nf1",
      }),
    ]);
    expect(packages).toHaveLength(1);
    expect(packages[0]?.action).toBe("UPLOAD_MERGED");
    expect(packages[0]?.fiscalId).toBe("nf1");
    expect(packages[0]?.proofId).toBe("p1");
  });

  it("envia só comprovante quando não há NF/RPA", () => {
    const packages = buildSalicPublishPackages([
      doc({ id: "p1", kind: "PAYMENT_PROOF", filename: "comp.pdf" }),
    ]);
    expect(packages).toHaveLength(1);
    expect(packages[0]?.action).toBe("UPLOAD_PROOF_ONLY");
    expect(packages[0]?.fiscalId).toBeNull();
  });

  it("não envia NF/RPA separada quando há comprovante vinculado", () => {
    const packages = buildSalicPublishPackages([
      doc({ id: "nf1", kind: "NF" }),
      doc({ id: "p1", sourceDocumentId: "nf1" }),
    ]);
    expect(packages.some((p) => p.fiscalId === "nf1" && p.proofId !== "p1")).toBe(
      false,
    );
  });

  it("republica merged quando NF chega depois do comprovante no SALIC", () => {
    const packages = buildSalicPublishPackages([
      doc({ id: "nf1", kind: "NF" }),
      doc({
        id: "p1",
        sourceDocumentId: "nf1",
        salicComprovanteId: "salic-99",
        salicPublishMode: "PROOF_ONLY",
        salicRepublishPending: true,
      }),
    ]);
    expect(packages).toHaveLength(1);
    expect(packages[0]?.action).toBe("REPUBLISH_MERGED");
    expect(packages[0]?.replaceSalicId).toBe("salic-99");
  });

  it("ignora pacote já publicado como merged", () => {
    const packages = buildSalicPublishPackages([
      doc({ id: "nf1", kind: "NF" }),
      doc({
        id: "p1",
        sourceDocumentId: "nf1",
        salicComprovanteId: "salic-1",
        salicPublishMode: "MERGED",
      }),
    ]);
    expect(packages).toHaveLength(0);
  });
});
