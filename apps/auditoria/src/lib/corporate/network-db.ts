import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";
import { buildNetwork, type NetCompany, type NetMembership } from "@/lib/corporate/network";

/** Monta a rede do workspace a partir dos mapas societários cadastrados. */
export async function loadNetwork(workspaceId: string) {
  const [accounts, watched] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        cgccpf: true,
        corporatePeriods: { include: { members: true } },
      },
    }),
    prisma.watchedSupplier.findMany({
      where: { workspaceId },
      select: {
        id: true,
        label: true,
        nameQuery: true,
        cgccpf: true,
        supplier: { select: { name: true, cgccpf: true } },
        corporatePeriods: { include: { members: true } },
      },
    }),
  ]);

  const accountDocs = new Set(accounts.map((a) => normalizeCgccpf(a.cgccpf)));
  const watchedDocs = new Set(
    watched.map((w) => normalizeCgccpf(w.cgccpf || w.supplier?.cgccpf || "")).filter(Boolean),
  );
  const companies: NetCompany[] = [];
  const memberships: NetMembership[] = [];
  const addPeriods = (
    key: string,
    periods: Array<{ validFrom: Date; validTo: Date | null; members: Array<{ name: string; cgccpf: string; role: string }> }>,
  ) => {
    for (const p of periods) {
      for (const mm of p.members) {
        memberships.push({ companyKey: key, name: mm.name, doc: mm.cgccpf, role: mm.role, from: p.validFrom, to: p.validTo });
      }
    }
  };
  for (const a of accounts) {
    const key = `a:${a.id}`;
    companies.push({ key, name: a.name, doc: normalizeCgccpf(a.cgccpf), kind: "proponente", href: `/contas/mapa/${a.id}` });
    addPeriods(key, a.corporatePeriods);
  }
  // Empresa observada que também é proponente usa o mapa do proponente (um por CNPJ).
  const companiesWithoutMap: Array<{ id: string; name: string }> = [];
  for (const w of watched) {
    const doc = normalizeCgccpf(w.cgccpf || w.supplier?.cgccpf || "");
    if (doc.length !== 14 || accountDocs.has(doc)) continue;
    const key = `w:${w.id}`;
    const name = w.label || w.supplier?.name || w.nameQuery || doc;
    companies.push({ key, name, doc, kind: "observado", href: `/observados/${w.id}/mapa` });
    addPeriods(key, w.corporatePeriods);
    if (w.corporatePeriods.length === 0) companiesWithoutMap.push({ id: w.id, name });
  }
  const accountsWithoutMap = accounts
    .filter((a) => normalizeCgccpf(a.cgccpf).length === 14 && a.corporatePeriods.length === 0)
    .map((a) => ({ id: a.id, name: a.name }));

  const groups = buildNetwork({ companies, memberships, watchedDocs });

  // Quanto cada CPF/CNPJ da rede recebeu nos PRONACs do workspace.
  const docs = [
    ...new Set(
      groups.flatMap((g) => [...g.companies.map((c) => c.doc), ...g.people.map((p) => p.doc)]).filter(Boolean),
    ),
  ];
  const paid = docs.length
    ? await prisma.payment.findMany({
        where: { supplier: { cgccpf: { in: docs } }, project: { salicAccount: { workspaceId } } },
        select: { amount: true, supplier: { select: { cgccpf: true } } },
      })
    : [];
  const receivedByDoc = new Map<string, number>();
  for (const p of paid) {
    const d = p.supplier.cgccpf;
    receivedByDoc.set(d, Math.round(((receivedByDoc.get(d) ?? 0) + Number(p.amount)) * 100) / 100);
  }

  return {
    groups,
    receivedByDoc,
    withoutMap: [...companiesWithoutMap.map((c) => ({ ...c, kind: "watched" as const })), ...accountsWithoutMap.map((a) => ({ ...a, kind: "account" as const }))],
    companiesTotal: companies.length,
  };
}
