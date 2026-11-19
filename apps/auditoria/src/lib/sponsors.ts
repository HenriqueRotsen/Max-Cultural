import type { ComplianceAlert } from "@/lib/compliance/rouanet";
/**
 * Patrocinadores (incentivadores) de um projeto: quem aportou recurso na
 * conta de captação, pela API pública do SALIC. Funções puras, sem banco.
 */

export type SponsorshipRow = {
  cgccpf: string;
  name: string;
  amount: number;
  receivedAt: Date | string | null;
};

export type SponsorSummary = {
  cgccpf: string;
  name: string;
  total: number;
  count: number;
  firstAt: Date | null;
  lastAt: Date | null;
};

const digits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

const toDate = (d: Date | string | null) => {
  if (!d) return null;
  const v = d instanceof Date ? d : new Date(d);
  return Number.isNaN(v.getTime()) ? null : v;
};

/** Soma os aportes por patrocinador, do maior para o menor. */
export function summarizeSponsors(rows: SponsorshipRow[]): SponsorSummary[] {
  const by = new Map<string, SponsorSummary>();
  for (const r of rows) {
    const doc = digits(r.cgccpf) || r.name.trim().toUpperCase();
    const at = toDate(r.receivedAt);
    const cur = by.get(doc) || {
      cgccpf: digits(r.cgccpf),
      name: r.name.trim(),
      total: 0,
      count: 0,
      firstAt: null,
      lastAt: null,
    };
    cur.total += r.amount;
    cur.count += 1;
    if (at && (!cur.firstAt || at < cur.firstAt)) cur.firstAt = at;
    if (at && (!cur.lastAt || at > cur.lastAt)) cur.lastAt = at;
    by.set(doc, cur);
  }
  return [...by.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}

export type SponsorConflict = {
  sponsorName: string;
  sponsorCgccpf: string;
  supplierName: string;
  supplierCgccpf: string;
  /** Quanto o projeto pagou a esse fornecedor. */
  paid: number;
  /** "mesmo" = mesmo CPF/CNPJ; "grupo" = mesma empresa (mesma raiz do CNPJ, outra filial). */
  match: "mesmo" | "grupo";
};

/**
 * Patrocinador que também recebeu pagamento do mesmo projeto: o dinheiro
 * incentivado volta para quem patrocinou. Compara CPF/CNPJ e a raiz do CNPJ
 * (8 primeiros dígitos = mesma empresa, outra filial).
 */
export function findSponsorConflicts(
  sponsors: Array<{ cgccpf: string; name: string }>,
  suppliers: Array<{ cgccpf: string; name: string; total: number }>,
): SponsorConflict[] {
  const out: SponsorConflict[] = [];
  const seen = new Set<string>();
  for (const sp of sponsors) {
    const sd = digits(sp.cgccpf);
    if (sd.length < 11) continue;
    for (const su of suppliers) {
      const fd = digits(su.cgccpf);
      if (fd.length < 11) continue;
      let match: SponsorConflict["match"] | null = null;
      if (fd === sd) match = "mesmo";
      else if (sd.length === 14 && fd.length === 14 && fd.slice(0, 8) === sd.slice(0, 8)) match = "grupo";
      if (!match) continue;
      const key = `${sd}|${fd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        sponsorName: sp.name,
        sponsorCgccpf: sd,
        supplierName: su.name,
        supplierCgccpf: fd,
        paid: su.total,
        match,
      });
    }
  }
  return out.sort((a, b) => b.paid - a.paid);
}

/** Frase curta do aviso, igual na tela e no relatório. */
export function sponsorConflictText(c: SponsorConflict) {
  return c.match === "mesmo"
    ? `${c.sponsorName} patrocinou o projeto e também recebeu pagamento dele.`
    : `${c.sponsorName} patrocinou o projeto e uma empresa do mesmo grupo (${c.supplierName}) recebeu pagamento dele.`;
}

/**
 * Aviso de conformidade (amarelo) para cada patrocinador que recebeu
 * pagamento do projeto. Entra junto dos avisos de limite, na tela e no PDF.
 */
export function sponsorConflictAlerts(
  conflicts: SponsorConflict[],
  pronac: string,
): ComplianceAlert[] {
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return conflicts.map((c) => ({
    level: "attention" as const,
    code: "PATROCINADOR_RECEBEU",
    title: sponsorConflictText(c),
    detail: `${c.supplierName} recebeu ${brl(c.paid)} deste projeto. O dinheiro incentivado não pode voltar para quem patrocinou: confira se a contratação é permitida e guarde a justificativa.`,
    pronac,
    supplierName: c.supplierName,
    amount: c.paid,
    limitPct: 0,
  }));
}
