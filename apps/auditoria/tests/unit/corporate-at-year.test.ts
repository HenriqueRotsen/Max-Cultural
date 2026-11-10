import { describe, expect, it } from "vitest";
import { periodsInYear } from "@/lib/corporate/at-year";

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
