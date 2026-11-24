/**
 * Patrocinadores vistos pelo proponente (conta SALIC): quem aportou em quais
 * projetos dele, quantos aportes, quanto e com que concentração.
 */

const digits = (s: string) => (s || "").replace(/\D/g, "");

export type ProponentSponsorshipRow = {
  cgccpf: string;
  name: string;
  amount: number;
  receivedAt: Date | null;
  projectId: string;
};

export type ProponentProject = {
  id: string;
  pronac: string;
  name: string | null;
  accountId: string;
  valorCaptado: number | null;
};

export type ProponentAccount = { id: string; name: string; cgccpf: string };

export type ProponentSponsor = {
  /** Chave do patrocinador: CPF/CNPJ (dígitos) ou nome, quando sem documento. */
  key: string;
  cgccpf: string;
  name: string;
  aportes: number;
  total: number;
  /** Parte do total aportado no proponente (0–100). */
  share: number;
  firstAt: Date | null;
  lastAt: Date | null;
  /** Patrocinou e recebeu pagamento de algum projeto deste proponente. */
  conflict: boolean;
  projects: Array<{
    pronac: string;
    name: string | null;
    aportes: number;
    total: number;
  }>;
};

export type ProponentProjectSummary = {
  id: string;
  pronac: string;
  name: string | null;
  captado: number | null;
  total: number;
  aportes: number;
  sponsors: number;
  topSponsor: { name: string; share: number } | null;
};

export type ProponentAnalysis = {
  id: string;
  name: string;
  cgccpf: string;
  projectsTotal: number;
  projectsWithSponsors: number;
  sponsorsCount: number;
  /** Patrocinadores que aportaram em mais de um projeto do proponente. */
  recurrentSponsors: number;
  aportes: number;
  total: number;
  captado: number;
  /** Parte do maior patrocinador no total aportado (0–100). */
  topShare: number;
  /** Parte dos 3 maiores patrocinadores no total aportado (0–100). */
  top3Share: number;
  conflicts: number;
  firstAt: Date | null;
  lastAt: Date | null;
  sponsors: ProponentSponsor[];
  projects: ProponentProjectSummary[];
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const minDate = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxDate = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Chave de conflito: projeto + documento do patrocinador. */
export const conflictKey = (projectId: string, cgccpf: string) => `${projectId}|${digits(cgccpf)}`;

export function sponsorKey(cgccpf: string, name: string): string {
  return digits(cgccpf) || name.trim().toUpperCase();
}

export function buildProponentAnalysis(params: {
  accounts: ProponentAccount[];
  projects: ProponentProject[];
  rows: ProponentSponsorshipRow[];
  /** `conflictKey(projectId, cgccpf)` dos patrocinadores que receberam pagamento do projeto. */
  conflicts?: Set<string>;
}): ProponentAnalysis[] {
  const conflicts = params.conflicts ?? new Set<string>();
  const projectById = new Map(params.projects.map((p) => [p.id, p]));
  const rowsByAccount = new Map<string, ProponentSponsorshipRow[]>();
  for (const r of params.rows) {
    const p = projectById.get(r.projectId);
    if (!p) continue;
    rowsByAccount.set(p.accountId, [...(rowsByAccount.get(p.accountId) ?? []), r]);
  }

  const out: ProponentAnalysis[] = [];
  for (const acc of params.accounts) {
    const projects = params.projects.filter((p) => p.accountId === acc.id);
    if (!projects.length) continue;
    const rows = rowsByAccount.get(acc.id) ?? [];
    const total = rows.reduce((n, r) => n + r.amount, 0);

    const bySponsor = new Map<
      string,
      Omit<ProponentSponsor, "share" | "projects"> & {
        perProject: Map<
          string,
          {
            pronac: string;
            name: string | null;
            aportes: number;
            total: number;
          }
        >;
      }
    >();
    const byProject = new Map<
      string,
      {
        aportes: number;
        total: number;
        sponsors: Map<string, { name: string; total: number }>;
      }
    >();

    for (const r of rows) {
      const p = projectById.get(r.projectId)!;
      const key = sponsorKey(r.cgccpf, r.name);
      const s = bySponsor.get(key) ?? {
        key,
        cgccpf: digits(r.cgccpf),
        name: r.name.trim(),
        aportes: 0,
        total: 0,
        firstAt: null,
        lastAt: null,
        conflict: false,
        perProject: new Map(),
      };
      s.aportes += 1;
      s.total += r.amount;
      s.firstAt = minDate(s.firstAt, r.receivedAt);
      s.lastAt = maxDate(s.lastAt, r.receivedAt);
      if (s.cgccpf && conflicts.has(conflictKey(p.id, s.cgccpf))) s.conflict = true;
      const pp = s.perProject.get(p.pronac) ?? {
        pronac: p.pronac,
        name: p.name,
        aportes: 0,
        total: 0,
      };
      pp.aportes += 1;
      pp.total += r.amount;
      s.perProject.set(p.pronac, pp);
      bySponsor.set(key, s);

      const pj = byProject.get(p.id) ?? {
        aportes: 0,
        total: 0,
        sponsors: new Map(),
      };
      pj.aportes += 1;
      pj.total += r.amount;
      const ps = pj.sponsors.get(key) ?? { name: r.name.trim(), total: 0 };
      ps.total += r.amount;
      pj.sponsors.set(key, ps);
      byProject.set(p.id, pj);
    }

    const sponsors: ProponentSponsor[] = [...bySponsor.values()]
      .map(({ perProject, ...s }) => ({
        ...s,
        share: pct(s.total, total),
        projects: [...perProject.values()].sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));

    const projectSummaries: ProponentProjectSummary[] = projects
      .map((p) => {
        const pj = byProject.get(p.id);
        const top = pj ? [...pj.sponsors.values()].sort((a, b) => b.total - a.total)[0] : undefined;
        return {
          id: p.id,
          pronac: p.pronac,
          name: p.name,
          captado: p.valorCaptado,
          total: pj?.total ?? 0,
          aportes: pj?.aportes ?? 0,
          sponsors: pj?.sponsors.size ?? 0,
          topSponsor: top && pj ? { name: top.name, share: pct(top.total, pj.total) } : null,
        };
      })
      .sort((a, b) => b.total - a.total || (b.captado ?? 0) - (a.captado ?? 0) || a.pronac.localeCompare(b.pronac));

    out.push({
      id: acc.id,
      name: acc.name,
      cgccpf: digits(acc.cgccpf),
      projectsTotal: projects.length,
      projectsWithSponsors: projectSummaries.filter((p) => p.aportes > 0).length,
      sponsorsCount: sponsors.length,
      recurrentSponsors: sponsors.filter((s) => s.projects.length > 1).length,
      aportes: rows.length,
      total,
      captado: projects.reduce((n, p) => n + (p.valorCaptado ?? 0), 0),
      topShare: sponsors[0]?.share ?? 0,
      top3Share: pct(
        sponsors.slice(0, 3).reduce((n, s) => n + s.total, 0),
        total,
      ),
      conflicts: sponsors.filter((s) => s.conflict).length,
      firstAt: sponsors.reduce<Date | null>((d, s) => minDate(d, s.firstAt), null),
      lastAt: sponsors.reduce<Date | null>((d, s) => maxDate(d, s.lastAt), null),
      sponsors,
      projects: projectSummaries,
    });
  }
  return out.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}
