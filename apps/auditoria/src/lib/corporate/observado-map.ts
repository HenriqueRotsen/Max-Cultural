import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";
import { paymentsByPeriod } from "@/lib/corporate/qsa-import";
import { findProponentByDoc, unifyWatchedMapIntoAccount } from "@/lib/corporate/map-owner";

/**
 * Dados da página "Mapa societário" de um observado:
 * - os intervalos de sócios (se for empresa);
 * - o que ele recebeu nos PRONACs do workspace, por intervalo e por PRONAC;
 * - em que outras empresas cada sócio (ou o próprio observado, se for pessoa)
 *   aparece, e quanto essas pessoas receberam direto.
 */
export async function loadObservadoMap(watchedId: string, workspaceId: string) {
  const watched = await prisma.watchedSupplier.findFirst({
    where: { id: watchedId, workspaceId },
    include: {
      supplier: { select: { name: true, cgccpf: true } },
    },
  });
  if (!watched) return null;

  const doc = normalizeCgccpf(watched.cgccpf || watched.supplier?.cgccpf || "");
  // Um CNPJ, um mapa: se o observado também é proponente, vale o mapa do proponente.
  const proponent = doc ? await findProponentByDoc(doc, workspaceId) : null;
  const unify = proponent
    ? await unifyWatchedMapIntoAccount(watched.id, proponent.id)
    : { moved: 0, leftover: 0 };
  const ownerWhere = proponent
    ? { salicAccountId: proponent.id }
    : { watchedSupplierId: watched.id };
  const corporatePeriods = await prisma.corporatePeriod.findMany({
    where: ownerWhere,
    orderBy: { validFrom: "desc" },
    include: { members: { orderBy: { name: "asc" } } },
  });
  const name = watched.label || watched.supplier?.name || watched.nameQuery || doc;
  const isCompany = doc.length === 14;
  const inWorkspace = { project: { salicAccount: { workspaceId } } };

  const payments = doc
    ? await prisma.payment.findMany({
        where: { supplier: { cgccpf: doc }, ...inWorkspace },
        select: {
          amount: true,
          paymentDate: true,
          project: {
            select: {
              id: true,
              pronac: true,
              name: true,
              salicAccount: { select: { name: true, cgccpf: true } },
            },
          },
        },
      })
    : [];
  const pays = payments.map((p) => ({ ...p, amount: Number(p.amount) }));
  const total = Math.round(pays.reduce((s, p) => s + p.amount, 0) * 100) / 100;

  const { byPeriod, outside } = paymentsByPeriod(corporatePeriods, pays);

  const byProject = new Map<
    string,
    { pronac: string; name: string | null; proponent: string; count: number; total: number; first: Date | null; last: Date | null }
  >();
  for (const p of pays) {
    const row = byProject.get(p.project.id) ?? {
      pronac: p.project.pronac,
      name: p.project.name,
      proponent: p.project.salicAccount.name,
      count: 0,
      total: 0,
      first: null,
      last: null,
    };
    row.count += 1;
    row.total = Math.round((row.total + p.amount) * 100) / 100;
    if (p.paymentDate) {
      if (!row.first || p.paymentDate < row.first) row.first = p.paymentDate;
      if (!row.last || p.paymentDate > row.last) row.last = p.paymentDate;
    }
    byProject.set(p.project.id, row);
  }

  // Pessoas a cruzar: os sócios da empresa, ou o próprio observado (pessoa).
  const people = new Map<string, string>();
  for (const period of corporatePeriods) {
    for (const m of period.members) {
      const d = normalizeCgccpf(m.cgccpf);
      if (d.length === 11 || d.length === 14) people.set(d, m.name);
    }
  }
  if (!isCompany && doc) people.set(doc, name);
  const docs = [...people.keys()];

  const [memberships, watchedAll, proponents, directPays] = docs.length
    ? await Promise.all([
        prisma.corporatePeriodMember.findMany({
          where: {
            cgccpf: { in: docs },
            period: {
              OR: [{ salicAccount: { workspaceId } }, { watchedSupplier: { workspaceId } }],
            },
          },
          select: {
            cgccpf: true,
            role: true,
            period: {
              select: {
                salicAccountId: true,
                watchedSupplierId: true,
                validFrom: true,
                validTo: true,
                salicAccount: { select: { id: true, name: true, cgccpf: true } },
                watchedSupplier: {
                  select: { id: true, label: true, nameQuery: true, cgccpf: true },
                },
              },
            },
          },
        }),
        prisma.watchedSupplier.findMany({
          where: { workspaceId },
          select: { id: true, cgccpf: true },
        }),
        prisma.salicAccount.findMany({
          where: { workspaceId, cgccpf: { in: docs } },
          select: { id: true, name: true, cgccpf: true },
        }),
        prisma.payment.findMany({
          where: { supplier: { cgccpf: { in: docs } }, ...inWorkspace },
          select: { amount: true, supplier: { select: { cgccpf: true } } },
        }),
      ])
    : [[], [], [], []];

  const watchedByDoc = new Map(
    watchedAll.map((w) => [normalizeCgccpf(w.cgccpf || ""), w.id] as const).filter(([d]) => d),
  );

  const crossRefs = docs.map((d) => {
    const companies = new Map<
      string,
      { key: string; name: string; cgccpf: string; href: string | null; kind: "proponente" | "observado"; from: Date; to: Date | null }
    >();
    // Fora o próprio mapa (filtrado aqui: NOT no banco descartaria os nulos).
    const isOwn = (m: (typeof memberships)[number]) =>
      proponent
        ? m.period.salicAccountId === proponent.id
        : m.period.watchedSupplierId === watched.id;
    for (const m of memberships.filter((x) => normalizeCgccpf(x.cgccpf) === d && !isOwn(x))) {
      const acc = m.period.salicAccount;
      const w = m.period.watchedSupplier;
      const key = acc ? `a:${acc.id}` : `w:${w!.id}`;
      const prev = companies.get(key);
      const from = prev && prev.from < m.period.validFrom ? prev.from : m.period.validFrom;
      // Fim: aberto se algum intervalo ainda vale; senão, o mais tardio.
      const ends = [prev?.to, m.period.validTo].filter((x) => x !== undefined);
      const to = ends.some((x) => x === null)
        ? null
        : new Date(Math.max(...ends.map((x) => (x as Date).getTime())));
      companies.set(key, {
        key,
        name: acc ? acc.name : w!.label || w!.nameQuery || w!.cgccpf || "",
        cgccpf: normalizeCgccpf(acc ? acc.cgccpf : w!.cgccpf || ""),
        href: acc ? `/contas/mapa/${acc.id}` : `/observados/${w!.id}/mapa`,
        kind: acc ? "proponente" : "observado",
        from,
        to,
      });
    }
    const received = directPays
      .filter((p) => p.supplier.cgccpf === d)
      .reduce((s, p) => s + Number(p.amount), 0);
    return {
      cgccpf: d,
      name: people.get(d) || d,
      watchedId: watchedByDoc.get(d) ?? null,
      proponent: proponents.find((p) => normalizeCgccpf(p.cgccpf) === d) ?? null,
      companies: [...companies.values()].sort((a, b) => a.name.localeCompare(b.name)),
      received: Math.round(received * 100) / 100,
    };
  });

  return {
    watched,
    proponent,
    unify,
    corporatePeriods,
    doc,
    name,
    isCompany,
    total,
    paymentCount: pays.length,
    periods: corporatePeriods.map((p) => ({
      ...p,
      paid: byPeriod.get(p.id) ?? { count: 0, total: 0 },
    })),
    outside,
    projects: [...byProject.values()].sort((a, b) => b.total - a.total),
    crossRefs,
  };
}
