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

describe("buildSalicPublishPackages com documentos de apoio", () => {
  const support = (id: string, supportType: string, commitmentId = "c1") => ({
    ...doc({ id, kind: "SUPPORT", filename: `${supportType.toLowerCase()}.pdf` }),
    supportType,
    commitmentId,
  });
  const proof = (extra: Partial<Parameters<typeof doc>[0]> = {}) => ({
    ...doc({ id: "p1", kind: "PAYMENT_PROOF", filename: "comp.pdf", ...extra }),
    commitmentId: "c1",
    allocations: [{ commitmentId: "c1" }],
  });

  it("sem NF: apólice e boleto entram no mesmo PDF, na ordem certa", () => {
    const [pkg] = buildSalicPublishPackages([support("b", "BOLETO"), support("a", "APOLICE"), proof()]);
    expect(pkg?.action).toBe("UPLOAD_MERGED");
    expect(pkg?.supportIds).toEqual(["a", "b"]);
    expect(pkg?.fiscalId).toBeNull();
  });

  it("documento de outro lançamento não entra", () => {
    const [pkg] = buildSalicPublishPackages([support("x", "BOLETO", "c2"), proof()]);
    expect(pkg?.action).toBe("UPLOAD_PROOF_ONLY");
    expect(pkg?.supportIds).toEqual([]);
  });

  it("já enviado só com o comprovante: a apólice que chegou depois pede reenvio", () => {
    const [pkg] = buildSalicPublishPackages([
      support("a", "APOLICE"),
      proof({ salicComprovanteId: "123", salicPublishMode: "PROOF_ONLY" }),
    ]);
    expect(pkg?.action).toBe("REPUBLISH_MERGED");
    expect(pkg?.replaceSalicId).toBe("123");
    expect(pkg?.supportIds).toEqual(["a"]);
  });
});

describe("guia de imposto no SALIC", () => {
  const tax = (id: string, type: string, slot: string, extra: Partial<ReturnType<typeof doc>> = {}) => ({
    ...doc({ id, kind: "TAX_PROOF", filename: `${type}.pdf`, sourceDocumentId: "nf1", ...extra }),
    extractedJson: { taxDocType: type, taxSlot: slot, taxKind: "iss" },
  });

  it("cada rubrica da guia é um lançamento próprio: guia + nota do imposto + comprovante", () => {
    const packages = buildSalicPublishPackages([
      doc({ id: "nf1", kind: "NF" }),
      tax("g1", "GUIA", "s1"),
      tax("n1", "NF_IMPOSTO", "s1"),
      tax("c1", "COMPROVANTE", "s1"),
      tax("g2", "GUIA", "s2"),
      tax("c2", "COMPROVANTE", "s2"),
    ]);
    const taxes = packages.filter((p) => p.isTax);
    expect(taxes).toHaveLength(2);
    expect(taxes[0]).toMatchObject({ proofId: "c1", fiscalId: "g1", supportIds: ["n1"], action: "UPLOAD_MERGED" });
    expect(taxes[1]).toMatchObject({ proofId: "c2", fiscalId: "g2", supportIds: [] });
    expect(taxes[0]?.label).toMatch(/Guia ISS/);
  });

  it("guia já enviada só volta se marcada para atualizar", () => {
    const sent = buildSalicPublishPackages([
      tax("g1", "GUIA", "s1"),
      tax("c1", "COMPROVANTE", "s1", { salicComprovanteId: "77" }),
    ]);
    expect(sent.filter((p) => p.isTax)).toHaveLength(0);
    const again = buildSalicPublishPackages([
      tax("g1", "GUIA", "s1"),
      tax("c1", "COMPROVANTE", "s1", { salicComprovanteId: "77", salicRepublishPending: true }),
    ]);
    expect(again[0]).toMatchObject({ action: "REPUBLISH_MERGED", replaceSalicId: "77", isTax: true });
  });

  it("guia do formato antigo (sem parte por rubrica) não vai ao SALIC", () => {
    const old = { ...doc({ id: "c0", kind: "TAX_PROOF" }), extractedJson: { taxDocType: "COMPROVANTE" } };
    expect(buildSalicPublishPackages([old])).toHaveLength(0);
  });
});
