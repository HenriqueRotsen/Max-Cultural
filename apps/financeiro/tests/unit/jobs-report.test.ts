import { describe, expect, it } from "vitest";
import { buildJobsReport, jobKindOf, jobsReportCsv, normalizeCity } from "@/lib/planning/jobs-report";

const row = (doc: string, name: string, city: string | null, state: string | null, amount = 100) => ({
  doc,
  name,
  city,
  state,
  amount,
  supplierId: null,
});

describe("jobKindOf", () => {
  it("CPF é pessoa física; CNPJ com número no nome é MEI; senão, empresa", () => {
    expect(jobKindOf("52998224725", "Ana")).toBe("PF");
    expect(jobKindOf("56209144000107", "56.209.144 GABRIELA SILVA")).toBe("MEI");
    expect(jobKindOf("36498130000143", "BABACULANDIA LTDA")).toBe("PJ");
  });
});

describe("normalizeCity", () => {
  it("padroniza a escrita da cidade", () => {
    expect(normalizeCity("  BELO   HORIZONTE ")).toBe("Belo Horizonte");
    expect(normalizeCity("são joão DEL rei")).toBe("São João Del Rei");
    expect(normalizeCity("Conceição do Mato Dentro")).toBe("Conceição do Mato Dentro");
    expect(normalizeCity("")).toBeNull();
  });
});

describe("buildJobsReport", () => {
  it("conta cada CPF/CNPJ uma vez e agrupa por UF e cidade", () => {
    const r = buildJobsReport([
      row("52998224725", "Ana", "Belo Horizonte", "mg", 100),
      row("52998224725", "Ana", null, null, 50),
      row("11144477735", "Bia", "BELO HORIZONTE", "MG", 200),
      row("36498130000143", "EMPRESA LTDA", "Contagem", "MG", 300),
      row("56209144000107", "56.209.144 GABI", "São Paulo", "SP", 10),
      row("12345678901", "Sem Cidade", null, "MG", 5),
    ]);
    expect(r.totals).toEqual({ pf: 3, mei: 1, pj: 1, total: 5, amount: 665 });
    expect(r.states.map((s) => [s.state, s.total])).toEqual([
      ["MG", 3],
      ["SP", 1],
    ]);
    const bh = r.states[0]!.cities[0]!;
    expect(bh.city).toBe("Belo Horizonte");
    expect(bh.pf).toBe(2);
    expect(bh.amount).toBe(350);
    expect(r.missing.map((p) => p.name)).toEqual(["Sem Cidade"]);
  });

  it("gera CSV com ; e valores em reais", () => {
    const csv = jobsReportCsv(
      buildJobsReport([row("52998224725", "Ana; Silva", "Belo Horizonte", "MG", 1234.5)]),
    );
    expect(csv.split("\n")[1]).toBe('MG;Belo Horizonte;"Ana; Silva";52998224725;Pessoa física;1234,50');
  });
});
