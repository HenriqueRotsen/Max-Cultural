import { prisma } from "@/lib/db";
import {
  DEFAULT_CAPS,
  DEFAULT_RULES,
  type ActiveRules,
  type ComplianceCaps,
  type RelationKind,
  type RelationRules,
} from "@/lib/compliance/defaults";
import { seedComplianceCatalog } from "@/lib/compliance/seed-catalog";

/** { [rulesetVersion]: RelationKind[] } */
export type RelationBondOverrides = Record<string, RelationKind[]>;

export function parseRelationBondOverrides(
  raw: unknown,
): RelationBondOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: RelationBondOverrides = {};
  for (const [version, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    out[version] = list.filter((x): x is RelationKind => typeof x === "string");
  }
  return out;
}

export function applyRelationBondOverrides(
  rules: ActiveRules,
  overrides: RelationBondOverrides | null | undefined,
): ActiveRules {
  if (!overrides) return rules;
  const list = overrides[rules.version];
  if (!list) return rules;
  return {
    ...rules,
    caps: {
      ...rules.caps,
      relationRules: {
        ...rules.caps.relationRules,
        countsTowardProponentCap: [...list],
      },
    },
  };
}

export async function getWorkspaceRelationBondOverrides(
  workspaceId: string,
): Promise<RelationBondOverrides> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { relationBondOverrides: true },
  });
  return parseRelationBondOverrides(ws?.relationBondOverrides);
}

function parseRelationRules(raw: unknown): RelationRules {
  if (!raw || typeof raw !== "object") return DEFAULT_CAPS.relationRules;
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o.countsTowardProponentCap)
    ? (o.countsTowardProponentCap as RelationKind[])
    : DEFAULT_CAPS.relationRules.countsTowardProponentCap;
  return {
    countsTowardProponentCap: list,
    artisticGroupException: Boolean(
      o.artisticGroupException ?? DEFAULT_CAPS.relationRules.artisticGroupException,
    ),
    notes: String(o.notes || DEFAULT_CAPS.relationRules.notes),
  };
}

export function parseCaps(raw: unknown): ComplianceCaps {
  if (!raw || typeof raw !== "object") return DEFAULT_CAPS;
  const o = raw as Record<string, unknown>;
  const articles =
    o.articles && typeof o.articles === "object"
      ? (o.articles as Record<string, unknown>)
      : {};
  return {
    proponentCapPct: Number(o.proponentCapPct) || DEFAULT_CAPS.proponentCapPct,
    proponentMeiCapPct: Number(o.proponentMeiCapPct) || DEFAULT_CAPS.proponentMeiCapPct,
    supplierCapPct: Number(o.supplierCapPct) || DEFAULT_CAPS.supplierCapPct,
    nearCapPct: Number(o.nearCapPct) || DEFAULT_CAPS.nearCapPct,
    articles: {
      proponent: String(articles.proponent || DEFAULT_CAPS.articles.proponent),
      supplier: String(articles.supplier || DEFAULT_CAPS.articles.supplier),
      supplierExceptions: String(
        articles.supplierExceptions || DEFAULT_CAPS.articles.supplierExceptions,
      ),
    },
    relationRules: parseRelationRules(o.relationRules),
  };
}

export function toActiveRules(row: {
  id: string;
  version: string;
  sourceCode: string;
  sourceUrl: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  caps: unknown;
  legalSummary?: string | null;
  jurisprudenceNotes?: string | null;
  needsReview: boolean;
}): ActiveRules {
  return {
    id: row.id,
    version: row.version,
    sourceCode: row.sourceCode,
    sourceUrl: row.sourceUrl,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    caps: parseCaps(row.caps),
    legalSummary: row.legalSummary,
    jurisprudenceNotes: row.jurisprudenceNotes,
    needsReview: row.needsReview,
  };
}

export async function ensureDefaultRuleset(): Promise<ActiveRules> {
  await seedComplianceCatalog();

  const active = await prisma.complianceRuleset.findFirst({
    where: { status: "active" },
    orderBy: { effectiveFrom: "desc" },
  });
  if (active) return toActiveRules(active);

  return DEFAULT_RULES;
}

export async function getActiveRules(): Promise<ActiveRules> {
  try {
    return await ensureDefaultRuleset();
  } catch {
    return DEFAULT_RULES;
  }
}

export async function listRulesets(): Promise<ActiveRules[]> {
  await seedComplianceCatalog();
  const rows = await prisma.complianceRuleset.findMany({
    orderBy: { effectiveFrom: "asc" },
  });
  return rows.map(toActiveRules);
}

export async function getRulesetById(id: string): Promise<ActiveRules | null> {
  const row = await prisma.complianceRuleset.findUnique({ where: { id } });
  return row ? toActiveRules(row) : null;
}

export async function getRulesetByVersion(version: string): Promise<ActiveRules | null> {
  const row = await prisma.complianceRuleset.findUnique({ where: { version } });
  return row ? toActiveRules(row) : null;
}

export async function getPendingRulesetReview() {
  try {
    return await prisma.complianceRuleset.findFirst({
      where: { status: "draft", needsReview: true },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return null;
  }
}

/** Resolve rules for a project FK, falling back to active. */
export async function rulesForProject(
  project: {
    complianceRulesetId?: string | null;
    complianceRuleset?: {
      id: string;
      version: string;
      sourceCode: string;
      sourceUrl: string;
      effectiveFrom: Date;
      effectiveTo?: Date | null;
      caps: unknown;
      legalSummary?: string | null;
      jurisprudenceNotes?: string | null;
      needsReview: boolean;
    } | null;
  },
  options?: {
    workspaceId?: string | null;
    overrides?: RelationBondOverrides | null;
  },
): Promise<ActiveRules> {
  if (project.complianceRuleset) {
    return toActiveRules(project.complianceRuleset);
  }
  if (project.complianceRulesetId) {
    const row = await getRulesetById(project.complianceRulesetId);
    return row || (await getActiveRules());
  }
  return getActiveRules();
}
