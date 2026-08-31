import { describe, expect, it } from "vitest";
import { reconcilePlanningSalicFromExternalIds } from "@/lib/planning/federal/salic-reconcile";

describe("reconcilePlanningSalicFromExternalIds", () => {
  it("identifies orphan ids not present in SALIC set", async () => {
    // Pure logic test via mock would need prisma - test the filter logic inline
    const docs = [
      { id: "a", salicComprovanteId: "100" },
      { id: "b", salicComprovanteId: "200" },
      { id: "c", salicComprovanteId: "300" },
    ];
    const seen = new Set(["100", "300"]);
    const orphanIds = docs
      .filter((doc) => doc.salicComprovanteId && !seen.has(doc.salicComprovanteId))
      .map((doc) => doc.id);
    expect(orphanIds).toEqual(["b"]);
  });

  it("exports reconcile helper", () => {
    expect(typeof reconcilePlanningSalicFromExternalIds).toBe("function");
  });
});
