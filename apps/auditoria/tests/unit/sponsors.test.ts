import { describe, expect, it } from "vitest";
import { findSponsorConflicts, sponsorConflictText, summarizeSponsors } from "@/lib/sponsors";

describe("patrocinadores", () => {
  it("soma os aportes por patrocinador, do maior para o menor", () => {
    const s = summarizeSponsors([
      { cgccpf: "12.919.786/0001-24", name: "Empresa A", amount: 100, receivedAt: "2023-06-30T00:00:00Z" },
      { cgccpf: "12919786000124", name: "Empresa A", amount: 50, receivedAt: "2023-02-10T00:00:00Z" },
      { cgccpf: "11111111000111", name: "Empresa B", amount: 300, receivedAt: null },
    ]);
    expect(s.map((x) => [x.name, x.total, x.count])).toEqual([
      ["Empresa B", 300, 1],
      ["Empresa A", 150, 2],
    ]);
    expect(s[1]!.firstAt?.toISOString().slice(0, 10)).toBe("2023-02-10");
    expect(s[1]!.lastAt?.toISOString().slice(0, 10)).toBe("2023-06-30");
  });

  it("acha patrocinador que recebeu pagamento, pelo CNPJ ou pela mesma empresa", () => {
    const c = findSponsorConflicts(
      [
        { cgccpf: "12919786000124", name: "Patrocinadora" },
        { cgccpf: "22222222000122", name: "Outra" },
      ],
      [
        { cgccpf: "12919786000124", name: "Patrocinadora", total: 10 },
        { cgccpf: "12919786000205", name: "Patrocinadora Filial", total: 40 },
        { cgccpf: "33333333000133", name: "Sem relação", total: 99 },
      ],
    );
    expect(c.map((x) => [x.supplierName, x.match])).toEqual([
      ["Patrocinadora Filial", "grupo"],
      ["Patrocinadora", "mesmo"],
    ]);
    expect(sponsorConflictText(c[1]!)).toContain("também recebeu pagamento");
  });

  it("não compara raiz de CPF", () => {
    expect(
      findSponsorConflicts(
        [{ cgccpf: "12345678901", name: "Pessoa" }],
        [{ cgccpf: "12345678000199", name: "Empresa", total: 1 }],
      ),
    ).toEqual([]);
  });
});

describe("data do aporte", () => {
  it("guarda o dia do SALIC ao meio-dia, sem virar o dia anterior em Brasília", async () => {
    const { salicDayAtNoon } = await import("@/lib/salic/persist");
    const d = salicDayAtNoon("2023-06-30 00:00:00")!;
    expect(d.toISOString()).toBe("2023-06-30T12:00:00.000Z");
    expect(d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })).toBe("30/06/2023");
  });
});

describe("captações na API pública", () => {
  it("lê os patrocinadores do detalhe do projeto", async () => {
    const { vi } = await import("vitest");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          _embedded: {
            captacoes: [
              { PRONAC: "223863 ", valor: 92557.2, data_recibo: "2023-06-30 00:00:00", cgccpf: "12919786000124", nome_doador: "Empresa X S/A" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { listCaptacoesByPronac } = await import("@/lib/salic/api");
      const list = await listCaptacoesByPronac("223863");
      expect(list?.[0]?.nome_doador).toBe("Empresa X S/A");
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/projetos/223863?");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
