import { normalizeCgccpf } from "@/lib/format";
import { normalizePersonName } from "@/lib/corporate/qsa-import";

/**
 * Rede dos observados: empresas (observadas ou proponentes) ligadas pelas
 * pessoas que aparecem nos mapas societários. Cada grupo é um conjunto
 * conectado: se A e B têm um sócio em comum, e B e C também, os três ficam
 * no mesmo grupo. Só entram grupos com pelo menos duas empresas, ou uma
 * empresa com sócio que também é observado.
 */

export type NetCompany = {
  key: string;
  name: string;
  doc: string;
  kind: "observado" | "proponente";
  href: string;
};

export type NetMembership = {
  companyKey: string;
  name: string;
  doc: string;
  role: string;
  from: Date;
  to: Date | null;
};

export type NetPerson = {
  key: string;
  name: string;
  doc: string;
  /** Pessoa (CPF) que também está na lista de observados. */
  watched: boolean;
};

export type NetLink = {
  personKey: string;
  companyKey: string;
  role: string;
  from: Date;
  to: Date | null;
};

export type NetGroup = {
  companies: NetCompany[];
  people: NetPerson[];
  links: NetLink[];
};

/** Pessoa sem CPF completo vira chave pelo nome (fica marcada como "só nome"). */
export function personKeyOf(m: { doc: string; name: string }): string {
  const d = normalizeCgccpf(m.doc);
  return d.length === 11 || d.length === 14 ? `d:${d}` : `n:${normalizePersonName(m.name)}`;
}

export function buildNetwork(params: {
  companies: NetCompany[];
  memberships: NetMembership[];
  watchedDocs: Set<string>;
}): NetGroup[] {
  const companies = new Map(params.companies.map((c) => [c.key, c]));
  const companyByDoc = new Map(params.companies.map((c) => [normalizeCgccpf(c.doc), c]));

  // Uma pessoa jurídica sócia que também é empresa da lista vira ligação entre empresas.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  const people = new Map<string, NetPerson>();
  const links: NetLink[] = [];
  for (const m of params.memberships) {
    if (!companies.has(m.companyKey)) continue;
    const doc = normalizeCgccpf(m.doc);
    const asCompany = doc.length === 14 ? companyByDoc.get(doc) : undefined;
    const pKey = asCompany ? asCompany.key : personKeyOf(m);
    if (!asCompany && !people.has(pKey)) {
      people.set(pKey, {
        key: pKey,
        name: m.name,
        doc: doc.length === 11 || doc.length === 14 ? doc : "",
        watched: params.watchedDocs.has(doc),
      });
    }
    parent.set(pKey, parent.get(pKey) ?? pKey);
    parent.set(m.companyKey, parent.get(m.companyKey) ?? m.companyKey);
    union(pKey, m.companyKey);
    links.push({ personKey: pKey, companyKey: m.companyKey, role: m.role, from: m.from, to: m.to });
  }

  const groups = new Map<string, NetGroup>();
  const groupOf = (k: string) => {
    const root = find(k);
    let g = groups.get(root);
    if (!g) {
      g = { companies: [], people: [], links: [] };
      groups.set(root, g);
    }
    return g;
  };
  for (const c of params.companies) if (parent.has(c.key)) groupOf(c.key).companies.push(c);
  for (const p of people.values()) groupOf(p.key).people.push(p);
  // Uma linha por pessoa e empresa: junta os intervalos (do primeiro início ao
  // último fim; aberto se algum ainda vale).
  const merged = new Map<string, NetLink>();
  for (const l of links) {
    const k = `${l.personKey}|${l.companyKey}`;
    const prev = merged.get(k);
    if (!prev) {
      merged.set(k, { ...l });
      continue;
    }
    if (l.from < prev.from) prev.from = l.from;
    prev.to = prev.to === null || l.to === null ? null : l.to > prev.to ? l.to : prev.to;
    if (l.role !== prev.role) prev.role = "BOTH";
  }
  for (const l of merged.values()) groupOf(l.companyKey).links.push(l);

  return [...groups.values()]
    .filter((g) => g.companies.length >= 2 || g.people.some((p) => p.watched))
    .map((g) => ({
      companies: g.companies.sort((a, b) => a.name.localeCompare(b.name)),
      people: g.people.sort((a, b) => a.name.localeCompare(b.name)),
      links: g.links,
    }))
    .sort((a, b) => b.companies.length - a.companies.length || b.people.length - a.people.length);
}
