import { prisma } from "@/lib/db";
import { seedComplianceCatalog } from "@/lib/compliance/seed-catalog";
import { parseCaps } from "@/lib/compliance/rules";

export type PlanningRuleset = {
  version: string;
  sourceCode: string;
  sourceUrl: string;
  jurisdiction: string;
  kind: string;
  status: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  caps: ReturnType<typeof parseCaps>;
  legalSummary: string | null;
};

function rowToPlanning(row: {
  version: string;
  sourceCode: string;
  sourceUrl: string;
  jurisdiction: string;
  kind: string;
  status: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  caps: unknown;
  legalSummary: string | null;
}): PlanningRuleset {
  return {
    version: row.version,
    sourceCode: row.sourceCode,
    sourceUrl: row.sourceUrl,
    jurisdiction: row.jurisdiction,
    kind: row.kind,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    caps: parseCaps(row.caps),
    legalSummary: row.legalSummary,
  };
}

export async function listPlanningRulesets(jurisdiction?: string) {
  await seedComplianceCatalog();
  const rows = await prisma.complianceRuleset.findMany({
    where: {
      kind: { in: ["PLANNING", "BOTH"] },
      status: { in: ["active", "draft"] },
      ...(jurisdiction ? { jurisdiction } : {}),
    },
    orderBy: [{ jurisdiction: "asc" }, { effectiveFrom: "desc" }],
  });
  return rows.map(rowToPlanning);
}

export async function getPlanningRuleset(
  version: string,
): Promise<PlanningRuleset | null> {
  await seedComplianceCatalog();
  const row = await prisma.complianceRuleset.findUnique({ where: { version } });
  if (!row) return null;
  return rowToPlanning(row);
}
