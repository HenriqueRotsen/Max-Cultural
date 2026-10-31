import { prisma } from "@/lib/db";
import { parseCaps, toActiveRules } from "@/lib/compliance/rules";
import { rulesetToForm } from "@/lib/rulesets/form";
import type { RulesetCard } from "@/components/RulesetsManager";

/** INs cadastradas (sem as excluídas) para a tela de INs, mais recentes primeiro. */
export async function loadRulesetCards(workspaceId: string): Promise<RulesetCard[]> {
  const [rulesetRows, usage] = await Promise.all([
    prisma.complianceRuleset.findMany({
      where: { deletedAt: null },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.project.groupBy({
      by: ["complianceRulesetId"],
      where: { salicAccount: { workspaceId }, complianceRulesetId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const usageById = new Map(usage.map((u) => [u.complianceRulesetId, u._count._all]));
  return rulesetRows.map((row) => {
    const rules = toActiveRules(row);
    const raw = (row.caps && typeof row.caps === "object" ? row.caps : {}) as Record<string, unknown>;
    // Em IN sem limites os tetos efetivos viram 100 — mostra os valores guardados.
    const stored = rules.caps.noPercentLimits ? parseCaps({ ...raw, noPercentLimits: false }) : rules.caps;
    return {
      id: row.id,
      sourceCode: row.sourceCode,
      sourceUrl: row.sourceUrl,
      effectiveFrom: rules.effectiveFrom,
      effectiveTo: rules.effectiveTo || null,
      isDefault: row.status === "active",
      noPercentLimits: Boolean(rules.caps.noPercentLimits),
      proponentCapPct: stored.proponentCapPct,
      proponentMeiCapPct: stored.proponentMeiCapPct,
      supplierCapPct: stored.supplierCapPct,
      relations: rules.caps.relationRules.countsTowardProponentCap,
      notes: rules.caps.relationRules.notes || "",
      projectCount: usageById.get(row.id) || 0,
      form: rulesetToForm({ ...rules, isDefault: row.status === "active", rawCaps: raw }),
    };
  });
}
