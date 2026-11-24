import { describe, expect, it } from "vitest";
import { buildProponentAnalysis, conflictKey } from "@/lib/sponsors-by-proponent";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("patrocinadores por proponente", () => {
  const accounts = [
    { id: "a1", name: "Instituto A", cgccpf: "11.111.111/0001-11" },
    { id: "a2", name: "Produtora B", cgccpf: "22222222000122" },
  ];
  const projects = [
    { id: "p1", pronac: "100", name: "Festival", accountId: "a1", valorCaptado: 1000 },
    { id: "p2", pronac: "200", name: "Mostra", accountId: "a1", valorCaptado: 500 },
    { id: "p3", pronac: "300", name: null, accountId: "a1", valorCaptado: 0 },
    { id: "p4", pronac: "400", name: "Show", accountId: "a2", valorCaptado: 300 },
  ];
  const rows = [
    { cgccpf: "33.333.333/0001-33", name: "Banco X", amount: 400, receivedAt: d("2025-01-10"), projectId: "p1" },
    { cgccpf: "33333333000133", name: "Banco X", amount: 200, receivedAt: d("2025-03-10"), projectId: "p1" },
    { cgccpf: "33333333000133", name: "Banco X", amount: 100, receivedAt: d("2025-06-01"), projectId: "p2" },
    { cgccpf: "44444444000144", name: "Mineradora Y", amount: 300, receivedAt: d("2025-02-01"), projectId: "p1" },
    { cgccpf: "44444444000144", name: "Mineradora Y", amount: 300, receivedAt: null, projectId: "p4" },
  ];

  const [a1, a2] = buildProponentAnalysis({
    accounts,
    projects,
    rows,
    conflicts: new Set([conflictKey("p2", "33333333000133")]),
  });

  it("separa aportes, patrocinadores e projetos de cada proponente", () => {
    expect(a1!.id).toBe("a1");
    expect(a1!.aportes).toBe(4);
    expect(a1!.sponsorsCount).toBe(2);
    expect(a1!.total).toBe(1000);
    expect(a1!.captado).toBe(1500);
    expect(a1!.projectsTotal).toBe(3);
    expect(a1!.projectsWithSponsors).toBe(2);
    expect(a1!.recurrentSponsors).toBe(1);
    expect(a2!.total).toBe(300);
  });

  it("agrupa os aportes do patrocinador por PRONAC", () => {
    const banco = a1!.sponsors[0]!;
    expect(banco.name).toBe("Banco X");
    expect(banco.aportes).toBe(3);
    expect(banco.total).toBe(700);
    expect(banco.share).toBe(70);
    expect(banco.projects).toEqual([
      { pronac: "100", name: "Festival", aportes: 2, total: 600 },
      { pronac: "200", name: "Mostra", aportes: 1, total: 100 },
    ]);
    expect(banco.firstAt).toEqual(d("2025-01-10"));
    expect(banco.lastAt).toEqual(d("2025-06-01"));
    expect(banco.conflict).toBe(true);
    expect(a1!.conflicts).toBe(1);
    expect(a1!.topShare).toBe(70);
  });

  it("resume cada projeto com o maior patrocinador", () => {
    const festival = a1!.projects.find((p) => p.pronac === "100")!;
    expect(festival).toMatchObject({ aportes: 3, total: 900, sponsors: 2 });
    expect(festival.topSponsor).toEqual({ name: "Banco X", share: 66.7 });
    expect(a1!.projects.find((p) => p.pronac === "300")).toMatchObject({ aportes: 0, topSponsor: null });
  });
});
