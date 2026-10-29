import { describe, expect, it } from "vitest";
import {
  ACCESS_CATALOG,
  ACCESS_PERMISSION_IDS,
  grantedIdsFromRoleRows,
  normalizeGrantedIds,
  childrenOf,
  normalizeLegacyAccessId,
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
    const ids = normalizeGrantedIds(["financeiro.planejamento.excluir_nf"]);
    expect(ids).toContain("financeiro.planejamento.excluir_nf");
    expect(ids).toContain("financeiro.planejamento");
    expect(ids).toContain("financeiro.app");
  });

  it("legado canEdit vira .edit", () => {
    const set = grantedIdsFromRoleRows([
      { screen: "cultural.usuarios", canView: true, canEdit: true },
    ]);
    expect(set.has("cultural.usuarios")).toBe(true);
    expect(set.has("cultural.usuarios.edit")).toBe(true);
  });

  it("childrenOf lista capacidades da tela", () => {
    const caps = childrenOf("financeiro.planejamento");
    expect(caps.some((c) => c.id === "financeiro.planejamento.exceder_rubrica")).toBe(
      true,
    );
  });
});

describe("normalizeLegacyAccessId", () => {
  it("troca os prefixos antigos pelos novos nomes", () => {
    expect(normalizeLegacyAccessId("origem.planejamento.encerrar")).toBe(
      "financeiro.planejamento.encerrar",
    );
    expect(normalizeLegacyAccessId("fluxo.operacao")).toBe("indicadores.operacao");
    expect(normalizeLegacyAccessId("auditoria.app")).toBe("auditoria.app");
  });
});
