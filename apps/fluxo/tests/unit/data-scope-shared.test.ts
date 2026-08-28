import { describe, expect, it } from "vitest";
import {
  accessFromDb,
  accessToDb,
  compactScopeEntries,
  scopeKey,
} from "@/lib/data-scope-shared";

describe("data-scope-shared", () => {
  it("converte access", () => {
    expect(accessToDb("editor")).toBe("EDITOR");
    expect(accessFromDb("VIEWER")).toBe("viewer");
    expect(scopeKey("PROJETO", "p1")).toBe("PROJETO:p1");
  });

  it("compacta herdando do contexto", () => {
    const out = compactScopeEntries({
      entries: [
        { kind: "CONTEXTO", resourceId: "c1", access: "editor" },
        { kind: "PROJETO", resourceId: "p1", access: "editor" },
        { kind: "PROJETO", resourceId: "p2", access: "viewer" },
        { kind: "OFICINA", resourceId: "o1", access: "none" },
      ],
      projetos: [
        { id: "p1", contextoId: "c1" },
        { id: "p2", contextoId: "c1" },
      ],
      oficinas: [{ id: "o1", projetoId: "p2" }],
    });

    expect(out.find((e) => e.kind === "CONTEXTO" && e.resourceId === "c1")).toEqual({
      kind: "CONTEXTO",
      resourceId: "c1",
      access: "EDITOR",
    });
    // p1 igual ao pai → omitido
    expect(out.find((e) => e.resourceId === "p1")).toBeUndefined();
    // p2 diverge → gravado
    expect(out.find((e) => e.resourceId === "p2")?.access).toBe("VIEWER");
    // o1 diverge de p2 (viewer) → NONE
    expect(out.find((e) => e.resourceId === "o1")?.access).toBe("NONE");
  });
});
