/**
 * Grupo empresarial montado na hora: patrocinadores escolhidos vistos como um
 * só (aportes, PRONACs, valor total, proponentes). Nada é salvo — o grupo vive
 * no endereço da página.
 */
import { conflictKey, sponsorKey } from "@/lib/sponsors-by-proponent";

const digits = (s: string) => (s || "").replace(/\D/g, "");
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export type GroupSponsorshipRow = {
  cgccpf: string;
  name: string;
  amount: number;
  receivedAt: Date | null;
  projectId: string;
  pronac: string;
  projectName: string | null;
  accountId: string;
  accountName: string;
};

export type SponsorOption = { key: string; name: string; cgccpf: string; total: number; aportes: number };

export type SponsorGroup = {
  members: Array<SponsorOption & { share: number; pronacs: number; firstAt: Date | null; lastAt: Date | null; conflict: boolean }>;
  aportes: number;
  total: number;
  firstAt: Date | null;
  lastAt: Date | null;
  pronacs: Array<{
    pronac: string;
    name: string | null;
    accountName: string;
    aportes: number;
    total: number;
    /** Patrocinadores do grupo neste PRONAC. */
    members: Array<{ name: string; total: number }>;
  }>;
  proponents: Array<{ id: string; name: string; aportes: number; total: number; share: number; pronacs: number }>;
  conflicts: number;
  /** Patrocinadores fora do grupo com a mesma raiz de CNPJ (8 dígitos) de alguém do grupo. */
  suggestions: SponsorOption[];
};

/** Todos os patrocinadores, para escolher os do grupo (maior total primeiro). */
export function sponsorOptions(rows: GroupSponsorshipRow[]): SponsorOption[] {
  const by = new Map<string, SponsorOption>();
  for (const r of rows) {
    const key = sponsorKey(r.cgccpf, r.name);
    const cur = by.get(key) ?? { key, name: r.name.trim(), cgccpf: digits(r.cgccpf), total: 0, aportes: 0 };
    cur.total += r.amount;
    cur.aportes += 1;
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}

const minDate = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxDate = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
/** Raiz do CNPJ (empresa, sem a filial); CPF não tem raiz. */
const cnpjRoot = (doc: string) => (doc.length === 14 ? doc.slice(0, 8) : null);

export function buildSponsorGroup(params: {
  rows: GroupSponsorshipRow[];
  keys: string[];
  conflicts?: Set<string>;
}): SponsorGroup {
  const keys = new Set(params.keys);
  const conflicts = params.conflicts ?? new Set<string>();
  const rows = params.rows.filter((r) => keys.has(sponsorKey(r.cgccpf, r.name)));
  const total = rows.reduce((n, r) => n + r.amount, 0);

  const members = new Map<string, SponsorGroup["members"][number] & { pronacSet: Set<string> }>();
  const pronacs = new Map<string, SponsorGroup["pronacs"][number] & { memberMap: Map<string, { name: string; total: number }> }>();
  const proponents = new Map<string, { id: string; name: string; aportes: number; total: number; pronacSet: Set<string> }>();
  let firstAt: Date | null = null;
  let lastAt: Date | null = null;

  for (const r of rows) {
    const key = sponsorKey(r.cgccpf, r.name);
    const m = members.get(key) ?? {
      key,
      name: r.name.trim(),
      cgccpf: digits(r.cgccpf),
      total: 0,
      aportes: 0,
      share: 0,
      pronacs: 0,
      firstAt: null,
      lastAt: null,
      conflict: false,
      pronacSet: new Set<string>(),
    };
    m.total += r.amount;
    m.aportes += 1;
    m.firstAt = minDate(m.firstAt, r.receivedAt);
    m.lastAt = maxDate(m.lastAt, r.receivedAt);
    m.pronacSet.add(r.pronac);
    if (m.cgccpf && conflicts.has(conflictKey(r.projectId, m.cgccpf))) m.conflict = true;
    members.set(key, m);

    const p = pronacs.get(r.pronac) ?? {
      pronac: r.pronac,
      name: r.projectName,
      accountName: r.accountName,
      aportes: 0,
      total: 0,
      members: [],
      memberMap: new Map(),
    };
    p.aportes += 1;
    p.total += r.amount;
    const pm = p.memberMap.get(key) ?? { name: r.name.trim(), total: 0 };
    pm.total += r.amount;
    p.memberMap.set(key, pm);
    pronacs.set(r.pronac, p);

    const a = proponents.get(r.accountId) ?? { id: r.accountId, name: r.accountName, aportes: 0, total: 0, pronacSet: new Set() };
    a.aportes += 1;
    a.total += r.amount;
    a.pronacSet.add(r.pronac);
    proponents.set(r.accountId, a);

    firstAt = minDate(firstAt, r.receivedAt);
    lastAt = maxDate(lastAt, r.receivedAt);
  }

  const roots = new Set([...members.values()].map((m) => cnpjRoot(m.cgccpf)).filter(Boolean) as string[]);
  const suggestions = sponsorOptions(params.rows).filter(
    (o) => !keys.has(o.key) && roots.has(cnpjRoot(o.cgccpf) ?? "-"),
  );

  const memberList = [...members.values()]
    .map(({ pronacSet, ...m }) => ({ ...m, share: pct(m.total, total), pronacs: pronacSet.size }))
    .sort((a, b) => b.total - a.total);

  return {
    members: memberList,
    aportes: rows.length,
    total,
    firstAt,
    lastAt,
    pronacs: [...pronacs.values()]
      .map(({ memberMap, ...p }) => ({ ...p, members: [...memberMap.values()].sort((a, b) => b.total - a.total) }))
      .sort((a, b) => b.total - a.total),
    proponents: [...proponents.values()]
      .map(({ pronacSet, ...a }) => ({ ...a, share: pct(a.total, total), pronacs: pronacSet.size }))
      .sort((a, b) => b.total - a.total),
    conflicts: memberList.filter((m) => m.conflict).length,
    suggestions,
  };
}
