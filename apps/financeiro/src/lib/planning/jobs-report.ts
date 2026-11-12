/**
 * Relatório de empregos gerados: quantas pessoas e empresas o projeto
 * contratou, por estado e cidade. Cada CPF/CNPJ conta uma vez, mesmo com
 * vários pagamentos. Cidade e UF vêm do cadastro do fornecedor.
 */

export type JobKind = "PF" | "MEI" | "PJ";

export type JobRow = {
  doc: string;
  name: string;
  city: string | null;
  state: string | null;
  amount: number;
  /** Fornecedor no cadastro (para completar cidade/UF). */
  supplierId: string | null;
};

export type JobPerson = JobRow & { kind: JobKind };

export type JobsCity = {
  city: string;
  pf: number;
  mei: number;
  pj: number;
  total: number;
  amount: number;
  people: JobPerson[];
};

export type JobsState = {
  state: string;
  pf: number;
  mei: number;
  pj: number;
  total: number;
  amount: number;
  cities: JobsCity[];
};

export type JobsReport = {
  totals: { pf: number; mei: number; pj: number; total: number; amount: number };
  states: JobsState[];
  /** Sem cidade ou UF no cadastro: não entram em nenhum estado até completar. */
  missing: JobPerson[];
};

const round = (n: number) => Math.round(n * 100) / 100;

/** MEI: CNPJ cujo nome começa com o número do CNPJ (padrão da Receita para MEI). */
export function jobKindOf(doc: string, name: string): JobKind {
  if (doc.length === 11) return "PF";
  return /^\s*\d{2}\.?\d{3}\.?\d{3}\b/.test(name) ? "MEI" : "PJ";
}

export function normalizeCity(city: string | null | undefined): string | null {
  const c = (city || "").trim().replace(/\s+/g, " ");
  if (!c) return null;
  return c
    .toLowerCase()
    .split(" ")
    .map((w, i) =>
      i > 0 && ["de", "da", "do", "das", "dos", "e"].includes(w)
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

export function buildJobsReport(rows: JobRow[]): JobsReport {
  // Um registro por CPF/CNPJ (soma os valores; fica a cidade que existir).
  const byDoc = new Map<string, JobRow>();
  for (const r of rows) {
    if (r.doc.length !== 11 && r.doc.length !== 14) continue;
    const prev = byDoc.get(r.doc);
    if (!prev) {
      byDoc.set(r.doc, { ...r });
      continue;
    }
    prev.amount = round(prev.amount + r.amount);
    prev.city = prev.city || r.city;
    prev.state = prev.state || r.state;
    prev.supplierId = prev.supplierId || r.supplierId;
  }

  const states = new Map<string, JobsState>();
  const missing: JobPerson[] = [];
  const totals = { pf: 0, mei: 0, pj: 0, total: 0, amount: 0 };

  for (const r of byDoc.values()) {
    const person: JobPerson = { ...r, kind: jobKindOf(r.doc, r.name) };
    const city = normalizeCity(r.city);
    const uf = (r.state || "").trim().toUpperCase();
    const key = person.kind === "PF" ? "pf" : person.kind === "MEI" ? "mei" : "pj";
    totals[key] += 1;
    totals.total += 1;
    totals.amount = round(totals.amount + r.amount);
    if (!city || uf.length !== 2) {
      missing.push(person);
      continue;
    }
    const st =
      states.get(uf) ??
      ({ state: uf, pf: 0, mei: 0, pj: 0, total: 0, amount: 0, cities: [] } as JobsState);
    states.set(uf, st);
    let ct = st.cities.find((c) => c.city === city);
    if (!ct) {
      ct = { city, pf: 0, mei: 0, pj: 0, total: 0, amount: 0, people: [] };
      st.cities.push(ct);
    }
    for (const bucket of [st, ct]) {
      bucket[key] += 1;
      bucket.total += 1;
      bucket.amount = round(bucket.amount + r.amount);
    }
    ct.people.push({ ...person, city });
  }

  const sorted = [...states.values()]
    .map((s) => ({
      ...s,
      cities: s.cities
        .map((c) => ({ ...c, people: c.people.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => b.total - a.total || a.city.localeCompare(b.city)),
    }))
    .sort((a, b) => b.total - a.total || a.state.localeCompare(b.state));

  return {
    totals,
    states: sorted,
    missing: missing.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** CSV (separador ;) para abrir no Excel. */
export function jobsReportCsv(report: JobsReport): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const kindLabel = { PF: "Pessoa física", MEI: "MEI", PJ: "Empresa" } as const;
  const lines = [["UF", "Cidade", "Nome", "CPF/CNPJ", "Tipo", "Valor"].join(";")];
  for (const st of report.states) {
    for (const ct of st.cities) {
      for (const p of ct.people) {
        lines.push(
          [st.state, ct.city, p.name, p.doc, kindLabel[p.kind], p.amount.toFixed(2).replace(".", ",")]
            .map(esc)
            .join(";"),
        );
      }
    }
  }
  for (const p of report.missing) {
    lines.push(
      ["", "Sem cidade", p.name, p.doc, kindLabel[p.kind], p.amount.toFixed(2).replace(".", ",")]
        .map(esc)
        .join(";"),
    );
  }
  return lines.join("\n");
}
