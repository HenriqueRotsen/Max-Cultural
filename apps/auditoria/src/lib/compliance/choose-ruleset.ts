import { prisma } from "@/lib/db";
import {
  buildDeterministicBrief,
  compareRulesetScores,
  scoreRulesetForProject,
  type LinkedParty,
  type SupplierShare,
} from "@/lib/compliance/audit-brief";
import { listRulesets, toActiveRules } from "@/lib/compliance/rules";
import type { ActiveRules, RelationKind } from "@/lib/compliance/defaults";
import { isExcludedFromBondItem } from "@/lib/compliance/rouanet";
import type { Prisma } from "@/generated/prisma/client";

export function pronacYear(pronac: string): number {
  const digits = String(pronac).replace(/\D/g, "");
  if (digits.length < 2) return new Date().getFullYear();
  const yy = Number(digits.slice(0, 2));
  return yy >= 90 ? 1900 + yy : 2000 + yy;
}

function overlaps(rules: ActiveRules, start: Date, end: Date): boolean {
  const from = new Date(rules.effectiveFrom);
  const to = rules.effectiveTo ? new Date(rules.effectiveTo) : new Date("2999-01-01");
  return from <= end && to >= start;
}

/** Janela de execução: pagamentos se houver; senão ano do PRONAC. */
function candidatesForWindow(
  catalog: ActiveRules[],
  year: number,
  paymentMin?: Date | null,
  paymentMax?: Date | null,
): ActiveRules[] {
  const yearStart = new Date(`${year}-01-01`);
  const yearEnd = new Date(`${year}-12-31`);
  const start = paymentMin && paymentMax ? paymentMin : yearStart;
  const end = paymentMin && paymentMax ? paymentMax : yearEnd;
  const byExecution = catalog.filter((r) => overlaps(r, start, end));
  if (byExecution.length > 0) return byExecution;
  return catalog.filter((r) => overlaps(r, yearStart, yearEnd));
}

async function loadProjectContext(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      salicAccount: true,
      payments: {
        include: { supplier: true },
      },
      complianceRuleset: true,
    },
  });

  const projectTotalPaid = project.payments.reduce((s, p) => s + Number(p.amount), 0);
  const captado =
    project.valorCaptado != null ? Number(project.valorCaptado) : 0;
  const projectTotal =
    Number.isFinite(captado) && captado > 0 ? captado : projectTotalPaid;
  const bySupplier = new Map<string, SupplierShare>();
  for (const p of project.payments) {
    const key = p.supplier.cgccpf;
    const cur = bySupplier.get(key) || {
      name: p.supplier.name,
      cgccpf: p.supplier.cgccpf,
      total: 0,
      percent: 0,
    };
    cur.total += Number(p.amount);
    bySupplier.set(key, cur);
  }
  const suppliers = Array.from(bySupplier.values()).map((s) => ({
    ...s,
    percent: projectTotal > 0 ? (s.total / projectTotal) * 100 : 0,
  }));

  const bondByCnpj = new Map<string, number>();
  for (const p of project.payments) {
    if (isExcludedFromBondItem(p.itemName)) continue;
    const key = p.supplier.cgccpf.replace(/\D/g, "");
    bondByCnpj.set(key, (bondByCnpj.get(key) || 0) + Number(p.amount));
  }

  const { loadEnabledBondDocs } = await import("@/lib/compliance/bonds");
  const rulesetVersion =
    project.complianceRuleset?.version || "in-minc-29-2026";
  const bondedDocs = await loadEnabledBondDocs(
    project.salicAccountId,
    rulesetVersion,
  );

  const watched = await prisma.watchedSupplier.findMany({
    where: { workspaceId: project.salicAccount.workspaceId },
  });

  const proponentSide = {
    name: project.salicAccount.name,
    cgccpf: project.salicAccount.cgccpf.replace(/\D/g, ""),
  };

  const linked: LinkedParty[] = [];
  const seen = new Set<string>();

  for (const dig of bondedDocs) {
    if (!dig || dig === proponentSide.cgccpf) continue;
    seen.add(dig);
    const w = watched.find(
      (x) => (x.cgccpf || "").replace(/\D/g, "") === dig,
    );
    linked.push({
      name: w?.nameQuery || w?.label || dig,
      cgccpf: dig,
      relation: null,
      relatedTo: proponentSide,
      artisticGroupException: false,
      paidInProject: bondByCnpj.get(dig) || 0,
      isWatched: !!w,
      hasBond: true,
    });
  }

  for (const w of watched) {
    const digits = (w.cgccpf || "").replace(/\D/g, "");
    if (!digits || seen.has(digits)) continue;
    linked.push({
      name: w.nameQuery || w.label || digits,
      cgccpf: digits,
      relation: null,
      isWatched: true,
      paidInProject: bondByCnpj.get(digits) || 0,
      hasBond: false,
    });
  }

  const accountCnpj = proponentSide.cgccpf;
  const proponentPaid = bondByCnpj.get(accountCnpj) || 0;

  const paymentSlices = project.payments
    .filter((p) => p.paymentDate)
    .map((p) => ({ date: p.paymentDate as Date, amount: Number(p.amount) }));
  const paymentTimes = paymentSlices.map((p) => p.date.getTime());
  const paymentMin = paymentTimes.length ? new Date(Math.min(...paymentTimes)) : null;
  const paymentMax = paymentTimes.length ? new Date(Math.max(...paymentTimes)) : null;

  return {
    project,
    projectTotal,
    suppliers,
    linked,
    proponentPaid,
    paymentSlices,
    paymentMin,
    paymentMax,
    year: pronacYear(project.pronac),
  };
}

/**
 * Escolhe IN + briefing 1× para projeto novo (ranking determinístico).
 * Não sobrescreve se já houver ruleset / locked.
 */
export async function ensureProjectRuleset(
  projectId: string,
  options?: { forceBriefRefresh?: boolean; forceRechoose?: boolean },
) {
  const ctx = await loadProjectContext(projectId);
  const { project } = ctx;

  if (
    project.complianceRulesetId &&
    project.rulesetLocked &&
    !options?.forceBriefRefresh &&
    !options?.forceRechoose
  ) {
    return {
      skipped: true as const,
      projectId,
      rulesetId: project.complianceRulesetId,
    };
  }

  const catalog = await listRulesets();
  let candidatas = candidatesForWindow(
    catalog,
    ctx.year,
    ctx.paymentMin,
    ctx.paymentMax,
  );
  const forceVersions = ["in-5-2017", "in-2-2019", "in-minc-1-2023", "in-minc-29-2026"];
  const execStart = ctx.paymentMin || new Date(`${ctx.year}-01-01`);
  const execEnd = ctx.paymentMax || new Date(`${ctx.year}-12-31`);
  for (const v of forceVersions) {
    const r = catalog.find((c) => c.version === v);
    if (!r || candidatas.some((c) => c.version === v)) continue;
    if (overlaps(r, execStart, execEnd)) candidatas.push(r);
  }
  if (candidatas.length === 0) candidatas = catalog;

  const ranked = candidatas
    .map((rules) =>
      scoreRulesetForProject({
        rules,
        projectTotal: ctx.projectTotal,
        proponentPaid: ctx.proponentPaid,
        suppliers: ctx.suppliers,
        linked: ctx.linked,
        personType: project.salicAccount.personType,
        payments: ctx.paymentSlices,
      }),
    )
    .sort(compareRulesetScores);

  if (
    options?.forceBriefRefresh &&
    !options?.forceRechoose &&
    project.complianceRulesetId
  ) {
    const chosenRules = project.complianceRuleset
      ? toActiveRules(project.complianceRuleset)
      : ranked[0]?.rules;
    const briefOnly = buildDeterministicBrief({
      scores: ranked,
      chosen: chosenRules,
      suppliers: ctx.suppliers,
      linked: ctx.linked,
      projectTotal: ctx.projectTotal,
      pronacYear: ctx.year,
      institutionalMap: project.salicAccount.institutionalMap,
    });
    await prisma.project.update({
      where: { id: projectId },
      data: {
        auditBrief: briefOnly as unknown as Prisma.InputJsonValue,
      },
    });
    return { skipped: false as const, refreshedBrief: true as const, projectId };
  }

  const best = ranked[0];
  const version = best?.rules.version || "in-minc-29-2026";
  const brief = buildDeterministicBrief({
    scores: ranked,
    chosen: best?.rules,
    suppliers: ctx.suppliers,
    linked: ctx.linked,
    projectTotal: ctx.projectTotal,
    pronacYear: ctx.year,
    institutionalMap: project.salicAccount.institutionalMap,
  });

  const ruleset = await prisma.complianceRuleset.findUniqueOrThrow({
    where: { version },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      complianceRulesetId: ruleset.id,
      rulesetSource: "default",
      rulesetChosenAt: new Date(),
      rulesetRationale: best?.why || "Escolhida pelo ranking automático (cobertura + tetos).",
      rulesetLocked: true,
      auditBrief: brief as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    skipped: false as const,
    projectId,
    rulesetId: ruleset.id,
    version,
    source: "default" as const,
  };
}

export async function setProjectRulesetManual(params: {
  projectId: string;
  rulesetVersion: string;
  rationale?: string;
}) {
  const ruleset = await prisma.complianceRuleset.findUniqueOrThrow({
    where: { version: params.rulesetVersion },
  });
  await prisma.project.update({
    where: { id: params.projectId },
    data: {
      complianceRulesetId: ruleset.id,
      rulesetSource: "manual",
      rulesetChosenAt: new Date(),
      rulesetRationale: params.rationale || "Alterado manualmente pelo usuário.",
      rulesetLocked: true,
    },
  });
}

/** Após criar projeto no sync — fire-and-forget seguro. */
export function scheduleProjectRulesetChoice(projectId: string) {
  void ensureProjectRuleset(projectId).catch((err) => {
    console.warn("[ruleset] falha ao escolher IN do projeto", projectId, err);
  });
}
