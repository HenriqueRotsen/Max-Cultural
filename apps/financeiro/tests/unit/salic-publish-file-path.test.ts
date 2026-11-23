import path from "path";
import { describe, expect, it } from "vitest";
import { resolveProofFilePath } from "@/lib/salic/publish-robot";

describe("arquivo enviado ao SALIC", () => {
  it("mantém o endereço da nuvem como está (antes virava /var/task/.../sb:/...)", () => {
    const p = "sb://max-docs/planning/salic-merge/1795464928176-SALIC_257797_NF-COMPROVANTE.pdf";
    expect(resolveProofFilePath(p)).toBe(p);
  });
  it("caminho local relativo vira absoluto", () => {
    expect(resolveProofFilePath("uploads/x.pdf")).toBe(path.join(process.cwd(), "uploads/x.pdf"));
    expect(resolveProofFilePath("/tmp/x.pdf")).toBe("/tmp/x.pdf");
  });
});
