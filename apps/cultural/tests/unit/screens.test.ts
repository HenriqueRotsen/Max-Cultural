import { describe, expect, it } from "vitest";
import { SCREEN_IDS, SCREENS } from "@/lib/screens";

describe("screens catalog", () => {
  it("tem ids únicos", () => {
    expect(new Set(SCREEN_IDS).size).toBe(SCREEN_IDS.length);
  });

  it("inclui telas críticas de produtos", () => {
    const ids = new Set(SCREEN_IDS);
    expect(ids.has("financeiro.app")).toBe(true);
    expect(ids.has("financeiro.planejamento")).toBe(true);
    expect(ids.has("financeiro.planejamento.excluir_nf")).toBe(true);
    expect(ids.has("financeiro.planejamento.editar_rubricas")).toBe(true);
    expect(ids.has("cultural.usuarios.edit")).toBe(true);
    expect(ids.has("indicadores.app")).toBe(true);
    expect(ids.has("cultural.home")).toBe(true);
  });

  it("cada tela tem label e group", () => {
    for (const s of SCREENS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.group.length).toBeGreaterThan(0);
    }
  });
});
