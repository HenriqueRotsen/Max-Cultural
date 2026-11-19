import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { matchesPronacSearch, pronacSearchHay } from "@/lib/pronac-search";
import { renderSituacaoReportHtml } from "@/lib/reports/html";

const row = (pronac: string, accountName: string, situacao: string | null) => ({
  pronac,
  name: "Festival de Música",
  accountName,
  situacao,
});

describe("busca da aba Por PRONAC (também usada no relatório)", () => {
  it("acha por parte do número, proponente sem acento e situação", () => {
    const hay = pronacSearchHay(row("241234", "Instituto Tatajuba", "E61 - Em diligência"));
    expect(matchesPronacSearch(hay, "24")).toBe(true);
    expect(matchesPronacSearch(hay, "tatajuba")).toBe(true);
    expect(matchesPronacSearch(hay, "diligencia")).toBe(true);
    expect(matchesPronacSearch(hay, "musica 1234")).toBe(true);
    expect(matchesPronacSearch(hay, "99")).toBe(false);
    expect(matchesPronacSearch(hay, "")).toBe(true);
  });
});

describe("relatório Situação no SALIC", () => {
  it("lista cada projeto com a situação e mostra a busca usada", async () => {
    const html = await renderSituacaoReportHtml({
      rows: [
        { ...row("241234", "Instituto Tatajuba", "E12 - Captação autorizada"), lastSyncedAt: "2026-11-19T11:05:00.000Z" },
        { ...row("242000", "Instituto Tatajuba", null), lastSyncedAt: null },
      ],
      query: "24",
    });
    expect(html).toContain("Situação dos projetos");
    expect(html).toContain("Projetos da busca “24”");
    expect(html).not.toContain("Proponente: todos");
    expect(html).toContain("Captação autorizada");
    expect(html).toContain("Sem situação");
    expect(html).toContain("19/11/2026 · 08:05");
  });
});
