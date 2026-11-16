import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, Uint8Array>();
let uploaded: Buffer | null = null;

vi.mock("@/lib/nf/read-document-bytes", async (orig) => {
  const real = await orig<typeof import("@/lib/nf/read-document-bytes")>();
  return { ...real, readPlanningDocumentBytes: vi.fn(async (p: string) => Buffer.from(files.get(p)!)) };
});
vi.mock("@/lib/storage/object-store", () => ({
  docsBucket: () => "docs",
  uploadObject: vi.fn(async ({ buffer }: { buffer: Buffer }) => {
    uploaded = buffer;
    return "local/merged.pdf";
  }),
}));

import { mergeDocumentsToPdf } from "@/lib/nf/merge-pdf";

async function pdfWithPages(n: number) {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([300, 300]);
  return d.save();
}
// PNG 1x1 transparente.
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

describe("mergeDocumentsToPdf (sem Ghostscript)", () => {
  beforeEach(() => {
    files.clear();
    uploaded = null;
  });

  it("junta NF (2 páginas), foto do comprovante e apólice, na ordem", async () => {
    files.set("nf.pdf", await pdfWithPages(2));
    files.set("comp.png", PNG);
    files.set("apolice.pdf", await pdfWithPages(1));
    const r = await mergeDocumentsToPdf(
      [
        { storagePath: "nf.pdf", mimeType: "application/pdf", filename: "nf.pdf" },
        { storagePath: "apolice.pdf", mimeType: "application/pdf", filename: "apolice.pdf" },
        { storagePath: "comp.png", mimeType: "image/png", filename: "comp.png" },
      ],
      "SALIC_TESTE",
    );
    expect(r.storagePath).toBe("local/merged.pdf");
    const merged = await PDFDocument.load(uploaded!);
    expect(merged.getPageCount()).toBe(4);
  });

  it("imagem em formato que não dá para embutir: mensagem clara", async () => {
    files.set("foto.webp", Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]));
    await expect(
      mergeDocumentsToPdf(
        [{ storagePath: "foto.webp", mimeType: "image/webp", filename: "foto.webp" }],
        "X",
      ),
    ).rejects.toThrow("não está em JPG nem PNG");
  });
});
