import { describe, expect, it } from "vitest";
import { buildNetwork } from "@/lib/corporate/network";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const company = (key: string, doc: string, kind: "observado" | "proponente" = "observado") => ({
  key,
  name: key.toUpperCase(),
  doc,
  kind,
  href: `/x/${key}`,
});
const m = (companyKey: string, name: string, doc: string) => ({
  companyKey,
  name,
  doc,
  role: "PARTNER",
  from: d("2020-01-01"),
  to: null,
});

describe("buildNetwork", () => {
  it("junta empresas com sócio em comum, em cadeia", () => {
    const groups = buildNetwork({
      companies: [
        company("a", "11111111000191"),
        company("b", "22222222000191"),
        company("c", "33333333000191", "proponente"),
        company("z", "99999999000191"),
      ],
      memberships: [
        m("a", "ANA", "52998224725"),
        m("b", "ANA", "52998224725"),
        m("b", "BRUNO", "11144477735"),
        m("c", "BRUNO", "11144477735"),
        m("z", "ZÉ", "12345678909"),
      ],
      watchedDocs: new Set(),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.companies.map((c) => c.key)).toEqual(["a", "b", "c"]);
    expect(groups[0]!.people.map((p) => p.name)).toEqual(["ANA", "BRUNO"]);
  });

  it("empresa sócia de outra empresa da lista liga as duas", () => {
    const groups = buildNetwork({
      companies: [company("a", "11111111000191"), company("b", "22222222000191")],
      memberships: [m("a", "B LTDA", "22222222000191")],
      watchedDocs: new Set(),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.people).toHaveLength(0);
  });

  it("empresa sozinha só entra se tiver sócio observado", () => {
    const groups = buildNetwork({
      companies: [company("a", "11111111000191")],
      memberships: [m("a", "ANA", "52998224725")],
      watchedDocs: new Set(["52998224725"]),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.people[0]!.watched).toBe(true);
    expect(
      buildNetwork({
        companies: [company("a", "11111111000191")],
        memberships: [m("a", "ANA", "52998224725")],
        watchedDocs: new Set(),
      }),
    ).toHaveLength(0);
  });

  it("sócio sem CPF liga pelo nome", () => {
    const groups = buildNetwork({
      companies: [company("a", "11111111000191"), company("b", "22222222000191")],
      memberships: [m("a", "Joana Silva", ""), m("b", "JOANA SILVA", "")],
      watchedDocs: new Set(),
    });
    expect(groups).toHaveLength(1);
  });
});

describe("buildNetwork: intervalos seguidos", () => {
  it("vira uma linha só por pessoa e empresa", () => {
    const groups = buildNetwork({
      companies: [company("a", "11111111000191"), company("b", "22222222000191")],
      memberships: [
        { ...m("a", "ANA", "52998224725"), from: d("2020-01-01"), to: d("2023-12-31") },
        { ...m("a", "ANA", "52998224725"), from: d("2024-01-01"), to: null },
        m("b", "ANA", "52998224725"),
      ],
      watchedDocs: new Set(),
    });
    const toA = groups[0]!.links.filter((l) => l.companyKey === "a");
    expect(toA).toHaveLength(1);
    expect(toA[0]!.from.toISOString().slice(0, 10)).toBe("2020-01-01");
    expect(toA[0]!.to).toBeNull();
  });
});
