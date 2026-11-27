import { describe, expect, it } from "vitest";
import { buildSponsorGroup, sponsorOptions } from "@/lib/sponsor-group";
import { conflictKey } from "@/lib/sponsors-by-proponent";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const row = (o: Partial<Parameters<typeof buildSponsorGroup>[0]["rows"][number]>) => ({
  cgccpf: "",
  name: "",
  amount: 0,
  receivedAt: null,
  projectId: "p1",
  pronac: "100",
  projectName: "Festival",
  accountId: "a1",
  accountName: "Instituto A",
  ...o,
});

const VALE = "33592510000154";
const VALE_FILIAL = "33592510004060";
const SALOBO = "33931486000130";

const rows = [
  row({ cgccpf: VALE, name: "VALE S.A.", amount: 100, receivedAt: d("2024-01-10") }),
  row({ cgccpf: VALE, name: "VALE S.A.", amount: 50, receivedAt: d("2024-03-10"), projectId: "p2", pronac: "200", projectName: "Mostra" }),
  row({ cgccpf: SALOBO, name: "SALOBO METAIS", amount: 50, receivedAt: d("2024-02-01") }),
  row({ cgccpf: VALE_FILIAL, name: "VALE S.A. FILIAL", amount: 10 }),
  row({ cgccpf: "11111111000111", name: "BANCO X", amount: 999, accountId: "a2", accountName: "Produtora B", projectId: "p3", pronac: "300" }),
];

describe("grupo empresarial temporário", () => {
  const g = buildSponsorGroup({ rows, keys: [VALE, SALOBO], conflicts: new Set([conflictKey("p1", SALOBO)]) });

  it("soma aportes, total e PRONACs das empresas escolhidas", () => {
    expect(g.members.map((m) => m.name)).toEqual(["VALE S.A.", "SALOBO METAIS"]);
    expect(g.aportes).toBe(3);
    expect(g.total).toBe(200);
    expect(g.members[0]).toMatchObject({ aportes: 2, total: 150, share: 75, pronacs: 2 });
    expect(g.firstAt).toEqual(d("2024-01-10"));
    expect(g.lastAt).toEqual(d("2024-03-10"));
  });

  it("PRONAC repetido entre empresas do grupo aparece uma vez só", () => {
    expect(g.pronacs).toHaveLength(2);
    expect(g.pronacs[0]).toMatchObject({ pronac: "100", aportes: 2, total: 150 });
    expect(g.pronacs[0]!.members).toEqual([
      { name: "VALE S.A.", total: 100 },
      { name: "SALOBO METAIS", total: 50 },
    ]);
    expect(g.proponents).toEqual([{ id: "a1", name: "Instituto A", aportes: 3, total: 200, share: 100, pronacs: 2 }]);
  });

  it("marca quem também recebeu pagamento e sugere filiais (mesma raiz de CNPJ)", () => {
    expect(g.conflicts).toBe(1);
    expect(g.suggestions.map((s) => s.cgccpf)).toEqual([VALE_FILIAL]);
  });

  it("lista de opções traz todos os patrocinadores, maior total primeiro", () => {
    expect(sponsorOptions(rows).map((o) => o.name)).toEqual(["BANCO X", "VALE S.A.", "SALOBO METAIS", "VALE S.A. FILIAL"]);
  });
});
