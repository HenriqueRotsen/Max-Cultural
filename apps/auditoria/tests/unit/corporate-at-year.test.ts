import { describe, expect, it } from "vitest";
import { mapWindowForProject, periodsInYear, periodsInYears } from "@/lib/corporate/at-year";

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("periodsInYear", () => {
  const periods = [
    { id: "c", validFrom: d("2024-01-31"), validTo: null },
    { id: "a", validFrom: d("2014-04-08"), validTo: d("2017-08-31") },
    { id: "b", validFrom: d("2017-09-01"), validTo: d("2024-01-30") },
  ];

  it("traz os intervalos que tocam o ano, em ordem", () => {
    expect(periodsInYear(periods, 2017).map((p) => p.id)).toEqual(["a", "b"]);
    expect(periodsInYear(periods, 2024).map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("intervalo vigente vale para anos futuros", () => {
    expect(periodsInYear(periods, 2026).map((p) => p.id)).toEqual(["c"]);
  });

  it("ano antes da abertura não tem composição", () => {
    expect(periodsInYear(periods, 2010)).toEqual([]);
  });
});

describe("periodsInYears / mapWindowForProject", () => {
  const periods = [
    { id: "c", validFrom: d("2024-01-31"), validTo: null },
    { id: "a", validFrom: d("2014-04-08"), validTo: d("2017-08-31") },
    { id: "b", validFrom: d("2017-09-01"), validTo: d("2024-01-30") },
  ];

  it("faixa de anos pega todos os intervalos que a tocam", () => {
    expect(periodsInYears(periods, 2016, 2018).map((p) => p.id)).toEqual(["a", "b"]);
    expect(periodsInYears(periods, 2024, 2025).map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("usa os anos dos pagamentos, não o ano do PRONAC", () => {
    // PRONAC 22xxxx, pago em 2024: o mapa é o de 2024.
    const w = mapWindowForProject({
      pronacYear: 2022,
      firstPayment: d("2024-03-01"),
      lastPayment: d("2024-11-20"),
    });
    expect(w).toMatchObject({ fromYear: 2024, toYear: 2024, label: "2024" });
    expect(
      mapWindowForProject({ pronacYear: 2022, firstPayment: d("2023-12-10"), lastPayment: d("2024-02-01") }).label,
    ).toBe("2023–2024");
  });

  it("sem pagamentos, vale o ano do PRONAC", () => {
    expect(mapWindowForProject({ pronacYear: 2022 })).toMatchObject({ fromYear: 2022, toYear: 2022, label: "2022" });
  });
});
