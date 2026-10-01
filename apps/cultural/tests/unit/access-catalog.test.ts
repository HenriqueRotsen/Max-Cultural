import { describe, expect, it } from "vitest";
import {
  ACCESS_CATALOG,
  ACCESS_PERMISSION_IDS,
  grantedIdsFromRoleRows,
  normalizeGrantedIds,
  childrenOf,
} from "@max/auth";

describe("access catalog", () => {
  it("ids únicos", () => {
    expect(new Set(ACCESS_PERMISSION_IDS).size).toBe(ACCESS_PERMISSION_IDS.length);
  });

  it("capacidades têm parent de tela", () => {
    for (const e of ACCESS_CATALOG) {
      if (e.kind !== "capability") continue;
      expect(e.parentId).toBeTruthy();
      const parent = ACCESS_CATALOG.find((p) => p.id === e.parentId);
      expect(parent?.kind).toBe("screen");
    }
  });

  it("normalizeGrantedIds sobe pais", () => {
    const ids = normalizeGrantedIds(["origem.planejamento.excluir_nf"]);
    expect(ids).toContain("origem.planejamento.excluir_nf");
    expect(ids).toContain("origem.planejamento");
    expect(ids).toContain("origem.app");
  });

  it("legado canEdit vira .edit", () => {
    const set = grantedIdsFromRoleRows([
      { screen: "cultural.usuarios", canView: true, canEdit: true },
    ]);
    expect(set.has("cultural.usuarios")).toBe(true);
    expect(set.has("cultural.usuarios.edit")).toBe(true);
  });

  it("childrenOf lista capacidades da tela", () => {
    const caps = childrenOf("origem.planejamento");
    expect(caps.some((c) => c.id === "origem.planejamento.exceder_rubrica")).toBe(
      true,
    );
  });
});
