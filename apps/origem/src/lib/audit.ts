import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/crypto";
import { formatCurrency } from "@/lib/format";
import { demoProjectWhere } from "@/lib/demo";
import { toActiveRules } from "@/lib/compliance/rules";
import { DEFAULT_RULES, type ActiveRules } from "@/lib/compliance/defaults";
import { isExcludedFromBondItem } from "@/lib/compliance/rouanet";

export type PanoramaFilters = {
  accountId?: string;
  pronac?: string;
  from?: string;
  to?: string;
  /** Filtra projetos pela IN (ComplianceRuleset.version). */
  rulesetVersion?: string;
  /** Se true, restringe aos fornecedores da lista observada. */
  watchedOnly?: boolean;
  /** Isola dados ao workspace do cliente. */
  workspaceId?: string;
};

type WatchedMatchers = {
  count: number;
  cgccpfs: string[];
  names: string[];
};

/**
 * Base dos percentuais = valor captado no SALIC.
 * Fallback: soma dos pagamentos sincronizados (comprovado) se captado ainda não veio no sync.
 */
export function resolveProjectBase(params: {
  valorCaptado?: number | string | null;
  paidTotal: number;
}): { projectTotal: number; baseSource: "captado" | "comprovado"; paidTotal: number } {
  const captado =
    params.valorCaptado == null || params.valorCaptado === ""
      ? null
      : Number(params.valorCaptado);
  if (captado != null && Number.isFinite(captado) && captado > 0) {
    return {
      projectTotal: captado,
      baseSource: "captado",
      paidTotal: params.paidTotal,
    };
  }
  return {
    projectTotal: params.paidTotal,
    baseSource: "comprovado",
    paidTotal: params.paidTotal,
  };
}

async function loadWatchedMatchers(workspaceId?: string): Promise<WatchedMatchers> {
  const watched = await prisma.watchedSupplier.findMany({
    where: workspaceId ? { workspaceId } : undefined,
    include: { supplier: true },
  });

  return {
    count: watched.length,
    cgccpfs: watched
      .map((w) => w.cgccpf || w.supplier?.cgccpf)
      .filter(Boolean)
      .map((v) => normalizeCgccpf(String(v))),
    names: watched
      .map((w) => w.nameQuery)
      .filter(Boolean)
      .map((v) => String(v).toLowerCase()),
  };
}

function isWatchedSupplier(
  supplier: { cgccpf: string; name: string },
  matchers: WatchedMatchers,
): boolean {
  const cnpj = normalizeCgccpf(supplier.cgccpf);
  if (cnpj && matchers.cgccpfs.includes(cnpj)) return true;
  const name = supplier.name.toLowerCase();
  return matchers.names.some((q) => name.includes(q));
}

export async function getWatchedSupplierCount(workspaceId?: string) {
  return prisma.watchedSupplier.count({
    where: workspaceId ? { workspaceId } : undefined,
  });
}

/** Lista cadastrada de fornecedores observados (para relatórios/UI). */
export async function listWatchedSuppliers(workspaceId?: string) {
  const watched = await prisma.watchedSupplier.findMany({
    where: workspaceId ? { workspaceId } : undefined,
    orderBy: { createdAt: "asc" },
    include: { supplier: true },
  });

  return watched.map((w) => ({
    id: w.id,
    label: w.label,
    cgccpf: w.cgccpf || w.supplier?.cgccpf || null,
    name: w.nameQuery || w.supplier?.name || w.label || "—",
  }));
}

function projectScope(filters: PanoramaFilters) {
  return {
    ...(filters.accountId ? { salicAccountId: filters.accountId } : {}),
    ...(filters.workspaceId && !filters.accountId
      ? { salicAccount: { workspaceId: filters.workspaceId } }
      : {}),
    ...(filters.pronac ? { pronac: filters.pronac } : {}),
    ...(filters.rulesetVersion
      ? { complianceRuleset: { version: filters.rulesetVersion } }
      : {}),
  };
}

export async function getPanorama(filters: PanoramaFilters = {}) {
  const matchers = await loadWatchedMatchers(filters.workspaceId);
  const demoProjects = await demoProjectWhere(filters.workspaceId);

  const payments = await prisma.payment.findMany({
    where: {
      project: {
        ...projectScope(filters),
        ...demoProjects,
      },
      ...(filters.from || filters.to
        ? {
            paymentDate: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    },
    include: {
      supplier: true,
      project: { include: { salicAccount: true } },
    },
    orderBy: { paymentDate: "desc" },
  });

  const applyWatched = filters.watchedOnly === true && matchers.count > 0;

  const filtered = applyWatched
    ? payments.filter((p) => isWatchedSupplier(p.supplier, matchers))
    : payments;

  type Agg = {
    supplierId: string;
    cgccpf: string;
    name: string;
    total: number;
    count: number;
    projects: Set<string>;
    accounts: Map<string, { name: string; total: number; count: number }>;
    byPronac: Map<string, { pronac: string; projectName: string | null; total: number; count: number }>;
  };

  const map = new Map<string, Agg>();

  for (const p of filtered) {
    const key = p.supplierId;
    const amount = Number(p.amount);
    let agg = map.get(key);
    if (!agg) {
      agg = {
        supplierId: p.supplierId,
        cgccpf: p.supplier.cgccpf,
        name: p.supplier.name,
        total: 0,
        count: 0,
        projects: new Set(),
        accounts: new Map(),
        byPronac: new Map(),
      };
      map.set(key, agg);
    }
    agg.total += amount;
    agg.count += 1;
    agg.projects.add(p.project.pronac);

    const accountKey = p.project.salicAccountId;
    const accountName = p.project.salicAccount.name;
    const accountAgg = agg.accounts.get(accountKey) || {
      name: accountName,
      total: 0,
      count: 0,
    };
    accountAgg.total += amount;
    accountAgg.count += 1;
    agg.accounts.set(accountKey, accountAgg);

    const pronacAgg = agg.byPronac.get(p.project.pronac) || {
      pronac: p.project.pronac,
      projectName: p.project.name,
      total: 0,
      count: 0,
    };
    pronacAgg.total += amount;
    pronacAgg.count += 1;
    agg.byPronac.set(p.project.pronac, pronacAgg);
  }

  return Array.from(map.values())
    .map((a) => ({
      supplierId: a.supplierId,
      cgccpf: a.cgccpf,
      name: a.name,
      total: a.total,
      count: a.count,
      projectCount: a.projects.size,
      byAccount: Array.from(a.accounts.entries()).map(([id, v]) => ({
        accountId: id,
        ...v,
      })),
      byPronac: Array.from(a.byPronac.values()).sort((x, y) => y.total - x.total),
    }))
    .sort((a, b) => b.total - a.total);
}

export type PanoramaInsights = {
  total: number;
  paymentCount: number;
  supplierCount: number;
  projectCount: number;
  accountCount: number;
  avgPerSupplier: number;
  topSuppliers: Array<{
    supplierId: string;
    name: string;
    cgccpf: string;
    total: number;
    count: number;
    projectCount: number;
    sharePct: number;
  }>;
  topPronacs: Array<{
    pronac: string;
    name: string | null;
    total: number;
    sharePct: number;
    supplierCount: number;
  }>;
  concentration: {
    top1Pct: number;
    top3Pct: number;
    top5Pct: number;
  };
  watched: {
    count: number;
    total: number;
    sharePct: number;
  };
  /** PRONACs no filtro agrupados pela IN escolhida. */
  rulesets: Array<{
    version: string | null;
    sourceCode: string;
    count: number;
    sharePct: number;
  }>;
  highlights: string[];
};

/** Agrega insights do panorama (visão executiva). */
export async function getPanoramaInsights(
  filters: Omit<PanoramaFilters, "watchedOnly"> = {},
): Promise<PanoramaInsights> {
  const [rows, matchers] = await Promise.all([
    getPanorama({ ...filters, watchedOnly: false }),
    loadWatchedMatchers(filters.workspaceId),
  ]);

  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const paymentCount = rows.reduce((sum, r) => sum + r.count, 0);
  const projects = new Set<string>();
  const accounts = new Set<string>();
  const pronacMap = new Map<
    string,
    { pronac: string; name: string | null; total: number; suppliers: Set<string> }
  >();

  let watchedTotal = 0;

  for (const r of rows) {
    if (isWatchedSupplier({ cgccpf: r.cgccpf, name: r.name }, matchers)) {
      watchedTotal += r.total;
    }
    for (const p of r.byPronac) {
      projects.add(p.pronac);
      const agg = pronacMap.get(p.pronac) || {
        pronac: p.pronac,
        name: p.projectName,
        total: 0,
        suppliers: new Set<string>(),
      };
      agg.total += p.total;
      agg.suppliers.add(r.supplierId);
      if (!agg.name && p.projectName) agg.name = p.projectName;
      pronacMap.set(p.pronac, agg);
    }
    for (const a of r.byAccount) {
      accounts.add(a.accountId);
    }
  }

  const topSuppliers = rows.slice(0, 8).map((r) => ({
    supplierId: r.supplierId,
    name: r.name,
    cgccpf: r.cgccpf,
    total: r.total,
    count: r.count,
    projectCount: r.projectCount,
    sharePct: total > 0 ? (r.total / total) * 100 : 0,
  }));

  const topPronacs = Array.from(pronacMap.values())
    .map((p) => ({
      pronac: p.pronac,
      name: p.name,
      total: p.total,
      sharePct: total > 0 ? (p.total / total) * 100 : 0,
      supplierCount: p.suppliers.size,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const sumTop = (n: number) =>
    total > 0
      ? (rows.slice(0, n).reduce((s, r) => s + r.total, 0) / total) * 100
      : 0;

  const concentration = {
    top1Pct: sumTop(1),
    top3Pct: sumTop(3),
    top5Pct: sumTop(5),
  };

  const watchedShare = total > 0 ? (watchedTotal / total) * 100 : 0;

  const pronacList = Array.from(projects);
  const projectRulesets =
    pronacList.length > 0
      ? await prisma.project.findMany({
          where: {
            pronac: { in: pronacList },
            ...projectScope(filters),
          },
          select: {
            complianceRuleset: { select: { version: true, sourceCode: true } },
          },
        })
      : [];

  const rulesetMap = new Map<string, { version: string | null; sourceCode: string; count: number }>();
  for (const p of projectRulesets) {
    const version = p.complianceRuleset?.version ?? null;
    const sourceCode = p.complianceRuleset?.sourceCode ?? "Sem IN definida";
    const key = version || "__none__";
    const cur = rulesetMap.get(key) || { version, sourceCode, count: 0 };
    cur.count += 1;
    rulesetMap.set(key, cur);
  }
  const rulesetProjectTotal = projectRulesets.length || 1;
  const rulesets = Array.from(rulesetMap.values())
    .map((r) => ({
      ...r,
      sharePct: (r.count / rulesetProjectTotal) * 100,
    }))
    .sort((a, b) => b.count - a.count || a.sourceCode.localeCompare(b.sourceCode));

  const highlights: string[] = [];

  if (rows.length === 0) {
    highlights.push("Ainda não há pagamentos carregados. Atualize os dados para ver insights.");
  } else {
    if (topSuppliers[0]) {
      highlights.push(
        `${topSuppliers[0].name} concentra ${topSuppliers[0].sharePct.toFixed(1).replace(".", ",")}% do total pago no filtro.`,
      );
    }
    if (concentration.top5Pct >= 50) {
      highlights.push(
        `Os 5 maiores fornecedores somam ${concentration.top5Pct.toFixed(1).replace(".", ",")}% do total — atenção à concentração.`,
      );
    } else if (concentration.top5Pct > 0) {
      highlights.push(
        `Os 5 maiores fornecedores somam ${concentration.top5Pct.toFixed(1).replace(".", ",")}% do total.`,
      );
    }
    if (matchers.count > 0) {
      highlights.push(
        `Fornecedores observados: ${matchers.count} · ${watchedShare.toFixed(1).replace(".", ",")}% do total (${formatCurrency(watchedTotal)}).`,
      );
    }
    if (topPronacs[0]) {
      highlights.push(
        `PRONAC ${topPronacs[0].pronac} é o projeto com maior volume no filtro (${topPronacs[0].sharePct.toFixed(1).replace(".", ",")}%).`,
      );
    }
    if (rulesets[0] && projectRulesets.length > 0) {
      highlights.push(
        `IN mais frequente: ${rulesets[0].sourceCode} em ${rulesets[0].count} de ${projectRulesets.length} PRONAC${projectRulesets.length === 1 ? "" : "s"} do filtro.`,
      );
    }
  }

  return {
    total,
    paymentCount,
    supplierCount: rows.length,
    projectCount: projects.size,
    accountCount: accounts.size,
    avgPerSupplier: rows.length > 0 ? total / rows.length : 0,
    topSuppliers,
    topPronacs,
    concentration,
    watched: {
      count: matchers.count,
      total: watchedTotal,
      sharePct: watchedShare,
    },
    rulesets,
    highlights,
  };
}

export async function getSupplierDetail(supplierId: string, filters: PanoramaFilters = {}) {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id: supplierId },
  });
  const demoProjects = await demoProjectWhere(filters.workspaceId);

  const payments = await prisma.payment.findMany({
    where: {
      supplierId,
      project: {
        ...projectScope(filters),
        ...demoProjects,
      },
    },
    include: {
      project: {
        include: {
          salicAccount: true,
          complianceRuleset: {
            select: { version: true, sourceCode: true, sourceUrl: true },
          },
        },
      },
    },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
  });

  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const byPronac = new Map<
    string,
    {
      pronac: string;
      name: string | null;
      total: number;
      count: number;
      rulesetSourceCode: string | null;
      rulesetSourceUrl: string | null;
    }
  >();
  const byAccount = new Map<string, { name: string; total: number; count: number }>();

  for (const p of payments) {
    const amount = Number(p.amount);
    const pr = byPronac.get(p.project.pronac) || {
      pronac: p.project.pronac,
      name: p.project.name,
      total: 0,
      count: 0,
      rulesetSourceCode: p.project.complianceRuleset?.sourceCode ?? null,
      rulesetSourceUrl: p.project.complianceRuleset?.sourceUrl ?? null,
    };
    pr.total += amount;
    pr.count += 1;
    byPronac.set(p.project.pronac, pr);

    const acc = byAccount.get(p.project.salicAccountId) || {
      name: p.project.salicAccount.name,
      total: 0,
      count: 0,
    };
    acc.total += amount;
    acc.count += 1;
    byAccount.set(p.project.salicAccountId, acc);
  }

  return {
    supplier,
    payments,
    total,
    byPronac: Array.from(byPronac.values()).sort((a, b) => b.total - a.total),
    byAccount: Array.from(byAccount.entries()).map(([id, v]) => ({
      accountId: id,
      ...v,
    })),
  };
}

export function sharePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return (part / total) * 100;
}

export function formatPercent(part: number, total: number, digits = 4): string {
  return `${sharePercent(part, total).toFixed(digits).replace(".", ",")}%`;
}

/** Lista PRONACs com totais (visão de análise por projeto). */
export async function getPronacPanorama(filters: PanoramaFilters = {}) {
  const matchers = await loadWatchedMatchers(filters.workspaceId);
  const applyWatched = filters.watchedOnly === true && matchers.count > 0;
  const demoProjects = await demoProjectWhere(filters.workspaceId);

  const projects = await prisma.project.findMany({
    where: {
      ...projectScope(filters),
      ...demoProjects,
      payments: { some: {} },
    },
    include: {
      salicAccount: { select: { id: true, name: true, cgccpf: true, personType: true } },
      complianceRuleset: true,
      payments: {
        where: {
          ...(filters.from || filters.to
            ? {
                paymentDate: {
                  ...(filters.from ? { gte: new Date(filters.from) } : {}),
                  ...(filters.to ? { lte: new Date(filters.to) } : {}),
                },
              }
            : {}),
        },
        include: { supplier: { select: { id: true, cgccpf: true, name: true } } },
      },
    },
    orderBy: { pronac: "asc" },
  });

  return projects
    .map((project) => {
      const paidTotal = project.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const { projectTotal, baseSource } = resolveProjectBase({
        valorCaptado:
          project.valorCaptado != null ? Number(project.valorCaptado) : null,
        paidTotal,
      });
      const relevant = applyWatched
        ? project.payments.filter((p) => isWatchedSupplier(p.supplier, matchers))
        : project.payments;
      const total = relevant.reduce((sum, p) => sum + Number(p.amount), 0);

      function aggregatePayments(
        list: typeof project.payments,
        opts?: { forBond?: boolean },
      ): Array<{
        supplierId: string;
        name: string;
        cgccpf: string;
        total: number;
        count: number;
        percentOfProject: number;
        percentOfWatched: number;
      }> {
        const bySupplierMap = new Map<
          string,
          { supplierId: string; name: string; cgccpf: string; total: number; count: number }
        >();
        for (const p of list) {
          if (opts?.forBond && isExcludedFromBondItem(p.itemName)) continue;
          const amount = Number(p.amount);
          const agg = bySupplierMap.get(p.supplierId) || {
            supplierId: p.supplierId,
            name: p.supplier.name,
            cgccpf: p.supplier.cgccpf,
            total: 0,
            count: 0,
          };
          agg.total += amount;
          agg.count += 1;
          bySupplierMap.set(p.supplierId, agg);
        }
        return Array.from(bySupplierMap.values())
          .map((s) => ({
            ...s,
            percentOfProject: sharePercent(s.total, projectTotal),
            percentOfWatched: sharePercent(s.total, total),
          }))
          .sort((a, b) => b.total - a.total);
      }

      const bySupplier = aggregatePayments(relevant);
      /** Todos os fornecedores do PRONAC — base do aviso art. 23 §1º (independe do filtro). */
      const allBySupplier = applyWatched
        ? aggregatePayments(project.payments)
        : bySupplier;
      /** Totais §1º sem alimentação/refeição. */
      const bondBySupplier = applyWatched
        ? aggregatePayments(project.payments, { forBond: true })
        : aggregatePayments(relevant, { forBond: true });

      return {
        projectId: project.id,
        pronac: project.pronac,
        name: project.name,
        accountId: project.salicAccount.id,
        accountName: project.salicAccount.name,
        accountCgccpf: project.salicAccount.cgccpf,
        personType: project.salicAccount.personType,
        rules: (project.complianceRuleset
          ? toActiveRules(project.complianceRuleset)
          : DEFAULT_RULES) as ActiveRules,
        rulesetVersion: project.complianceRuleset?.version ?? null,
        rulesetSourceCode: project.complianceRuleset?.sourceCode ?? null,
        rulesetSourceUrl: project.complianceRuleset?.sourceUrl ?? null,
        projectTotal,
        paidTotal,
        baseSource,
        valorCaptado:
          project.valorCaptado != null ? Number(project.valorCaptado) : null,
        total,
        percentOfProject: sharePercent(total, projectTotal),
        paymentCount: relevant.length,
        supplierCount: bySupplier.length,
        watchedOnly: applyWatched,
        bySupplier,
        allBySupplier,
        bondBySupplier,
      };
    })
    .filter((p) => p.paymentCount > 0)
    .sort((a, b) => b.total - a.total);
}

/** Detalhe de um PRONAC: fornecedores com valor e % do gasto do projeto. */
export async function getPronacDetail(pronac: string, filters: PanoramaFilters = {}) {
  const matchers = await loadWatchedMatchers(filters.workspaceId);
  const applyWatched = filters.watchedOnly === true && matchers.count > 0;
  const demoProjects = await demoProjectWhere(filters.workspaceId);

  const projects = await prisma.project.findMany({
    where: {
      pronac,
      ...demoProjects,
      ...(filters.accountId
        ? { salicAccountId: filters.accountId }
        : filters.workspaceId
          ? { salicAccount: { workspaceId: filters.workspaceId } }
          : {}),
    },
    include: {
      salicAccount: { select: { id: true, name: true, cgccpf: true, personType: true } },
      complianceRuleset: true,
      payments: {
        where: {
          ...(filters.from || filters.to
            ? {
                paymentDate: {
                  ...(filters.from ? { gte: new Date(filters.from) } : {}),
                  ...(filters.to ? { lte: new Date(filters.to) } : {}),
                },
              }
            : {}),
        },
        include: { supplier: true },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  const allPayments = projects.flatMap((p) =>
    p.payments.map((payment) => ({
      ...payment,
      project: {
        id: p.id,
        pronac: p.pronac,
        name: p.name,
        salicAccount: p.salicAccount,
      },
    })),
  );

  const paidTotal = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const primaryProject =
    (filters.accountId
      ? projects.find((p) => p.salicAccountId === filters.accountId)
      : null) || projects[0];

  let valorCaptadoStored =
    primaryProject?.valorCaptado != null ? Number(primaryProject.valorCaptado) : null;

  // Se captado ainda não veio no sync, tenta API pública uma vez no detalhe.
  if (primaryProject && (valorCaptadoStored == null || valorCaptadoStored <= 0)) {
    try {
      const { refreshProjectFinancials } = await import("@/lib/salic/persist");
      const fin = await refreshProjectFinancials({
        projectId: primaryProject.id,
        pronac,
      });
      if (fin.valorCaptado != null) {
        valorCaptadoStored = fin.valorCaptado;
      }
    } catch {
      // Mantém fallback comprovado
    }
  }

  const { projectTotal, baseSource } = resolveProjectBase({
    valorCaptado: valorCaptadoStored,
    paidTotal,
  });
  const payments = applyWatched
    ? allPayments.filter((p) => isWatchedSupplier(p.supplier, matchers))
    : allPayments;
  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  type SupplierAgg = {
    supplierId: string;
    name: string;
    cgccpf: string;
    total: number;
    count: number;
  };

  const bySupplier = new Map<string, SupplierAgg>();
  for (const p of payments) {
    const amount = Number(p.amount);
    const agg = bySupplier.get(p.supplierId) || {
      supplierId: p.supplierId,
      name: p.supplier.name,
      cgccpf: p.supplier.cgccpf,
      total: 0,
      count: 0,
    };
    agg.total += amount;
    agg.count += 1;
    bySupplier.set(p.supplierId, agg);
  }

  const allBySupplier = new Map<string, SupplierAgg>();
  for (const p of allPayments) {
    const amount = Number(p.amount);
    const agg = allBySupplier.get(p.supplierId) || {
      supplierId: p.supplierId,
      name: p.supplier.name,
      cgccpf: p.supplier.cgccpf,
      total: 0,
      count: 0,
    };
    agg.total += amount;
    agg.count += 1;
    allBySupplier.set(p.supplierId, agg);
  }

  const bondBySupplier = new Map<string, SupplierAgg>();
  for (const p of allPayments) {
    if (isExcludedFromBondItem(p.itemName)) continue;
    const amount = Number(p.amount);
    const agg = bondBySupplier.get(p.supplierId) || {
      supplierId: p.supplierId,
      name: p.supplier.name,
      cgccpf: p.supplier.cgccpf,
      total: 0,
      count: 0,
    };
    agg.total += amount;
    agg.count += 1;
    bondBySupplier.set(p.supplierId, agg);
  }

  const suppliers = Array.from(bySupplier.values())
    .map((s) => ({
      ...s,
      /** % sobre o valor captado do PRONAC */
      percent: sharePercent(s.total, projectTotal),
      /** % entre os fornecedores exibidos (quando filtro de observados) */
      percentOfFiltered: sharePercent(s.total, total),
    }))
    .sort((a, b) => b.total - a.total);

  const allSuppliers = applyWatched
    ? Array.from(allBySupplier.values())
        .map((s) => ({
          ...s,
          percent: sharePercent(s.total, projectTotal),
          percentOfFiltered: sharePercent(s.total, projectTotal),
        }))
        .sort((a, b) => b.total - a.total)
    : suppliers;

  const bondSuppliers = Array.from(bondBySupplier.values())
    .map((s) => ({
      ...s,
      percent: sharePercent(s.total, projectTotal),
      percentOfFiltered: sharePercent(s.total, projectTotal),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    pronac,
    name: projects.find((p) => p.name)?.name || null,
    accounts: projects.map((p) => ({
      id: p.salicAccount.id,
      name: p.salicAccount.name,
      cgccpf: p.salicAccount.cgccpf,
      personType: p.salicAccount.personType,
    })),
    projectId: primaryProject?.id || null,
    compliance: primaryProject
      ? {
          rulesetId: primaryProject.complianceRulesetId,
          version: primaryProject.complianceRuleset?.version || null,
          sourceCode: primaryProject.complianceRuleset?.sourceCode || null,
          source: primaryProject.rulesetSource,
          rationale: primaryProject.rulesetRationale,
          locked: primaryProject.rulesetLocked,
          auditBrief: primaryProject.auditBrief,
          caps: primaryProject.complianceRuleset?.caps || null,
        }
      : null,
    projectTotal,
    paidTotal,
    baseSource,
    valorCaptado: valorCaptadoStored,
    total,
    percentOfProject: sharePercent(total, projectTotal),
    paymentCount: payments.length,
    supplierCount: suppliers.length,
    watchedOnly: applyWatched,
    watchedCount: matchers.count,
    suppliers,
    /** Base completa do PRONAC para avisos art. 23 §1º */
    allSuppliers,
    /** Totais §1º sem alimentação/refeição */
    bondSuppliers,
    payments,
  };
}
