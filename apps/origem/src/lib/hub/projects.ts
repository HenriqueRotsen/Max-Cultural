import { prisma } from "@/lib/db";
import { needsLogin } from "@/lib/auth/config";
import { getHubSessionPayload, isHubSsoEnabled } from "@/lib/auth/hub";
import { ensureBootstrapWorkspace } from "@/lib/auth/workspace";
import { computeProjectBalance } from "@/lib/planning/rubric-balance";
import {
  importSourceLabel,
  jurisdictionLabel,
  lifecycleLabel,
} from "@/lib/planning/lifecycle";
import { parseSessionToken } from "@max/auth";

export type HubProjectSummary = {
  slug: string;
  id: string;
  code: string;
  name: string;
  lawLabel: string;
  lifecycleStatus: string;
  lifecycleLabel: string;
  situacao: string | null;
  jurisdiction: string;
  jurisdictionLabel: string;
  accountName: string;
  importSourceLabel: string;
  hasSheet: boolean;
  totalApproved: number;
  totalReserved: number;
  totalPaid: number;
  totalAvailable: number;
  commitmentsCount: number;
  documentsCount: number;
  updatedAt: string;
  origemPlanejamentoUrl: string;
  origemPainelUrl: string;
};

function money(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function origemBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");
}

/** Slug estável e legível (PRONAC); desambigua com sufixo do id se houver colisão. */
export function toHubSlugBase(externalCode: string) {
  return String(externalCode || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function hubProjectSlug(externalCode: string, id: string, collidingBases: Set<string>) {
  const base = toHubSlugBase(externalCode);
  if (!base) return id;
  if (collidingBases.has(base)) return `${base}--${id.slice(-8)}`;
  return base;
}

async function workspaceFromHubEmail(emailRaw: string, userId?: string) {
  const email = emailRaw.toLowerCase();
  const byEmail = await prisma.appUser.findUnique({
    where: { email },
    select: { workspaceId: true, active: true },
  });
  if (byEmail?.active) return byEmail.workspaceId;

  const workspace = await ensureBootstrapWorkspace();
  await prisma.appUser.upsert({
    where: { email },
    update: { active: true, mustChangePassword: false },
    create: {
      id: userId || `hub_${email}`,
      email,
      name: email.split("@")[0] || "MAX Cultural",
      role: "ADMIN",
      mustChangePassword: false,
      active: true,
      workspaceId: workspace.id,
    },
  });
  return workspace.id;
}

/**
 * Resolve workspace para APIs do hub.
 * Aceita token opcional (cookie já lido ou cabeçalho x-max-session do Cultural).
 */
export async function resolveWorkspaceIdForHubApi(
  sessionToken?: string | null,
): Promise<string | null> {
  // 1) Token explícito do hub Cultural
  if (sessionToken) {
    try {
      const parsed = await parseSessionToken(sessionToken);
      if (parsed?.email) {
        return workspaceFromHubEmail(parsed.email, parsed.userId);
      }
      // Token sem e-mail: ainda assim tenta cookie abaixo
    } catch {
      // ignora e tenta outras fontes
    }
  }

  // 2) Cookie da requisição (SSO)
  if (isHubSsoEnabled()) {
    const hub = await getHubSessionPayload();
    if (hub?.email) {
      return workspaceFromHubEmail(hub.email, hub.userId);
    }
  }

  // 3) Ambiente local aberto
  if (!needsLogin()) {
    const workspace = await ensureBootstrapWorkspace();
    return workspace.id;
  }

  return null;
}

function toSummary(
  p: {
    id: string;
    externalCode: string;
    name: string | null;
    lifecycleStatus: string;
    jurisdiction: string;
    importSource: string | null;
    updatedAt: Date;
    rulesetVersion: string;
    account: { name: string };
    ruleset: { sourceCode: string; version: string } | null;
    project: { situacao: string | null } | null;
    sheet: {
      totalApproved: unknown;
      lines: Array<{
        id: string;
        approvedAmount: unknown;
      }>;
    } | null;
    commitments: Array<{ budgetLineId: string; amount: unknown; status: string }>;
    documents: Array<{ id: string }>;
  },
  slug: string,
): HubProjectSummary {
  const bal = p.sheet
    ? computeProjectBalance({
        lines: p.sheet.lines,
        commitments: p.commitments,
      })
    : null;

  return {
    slug,
    id: p.id,
    code: p.externalCode,
    name: p.name || p.externalCode,
    lawLabel: p.ruleset?.sourceCode || p.rulesetVersion || "—",
    lifecycleStatus: p.lifecycleStatus,
    lifecycleLabel: lifecycleLabel(p.lifecycleStatus),
    situacao: p.project?.situacao || null,
    jurisdiction: p.jurisdiction,
    jurisdictionLabel: jurisdictionLabel(p.jurisdiction),
    accountName: p.account.name,
    importSourceLabel: importSourceLabel(p.importSource),
    hasSheet: Boolean(p.sheet),
    totalApproved: bal?.totalApproved ?? money(p.sheet?.totalApproved),
    totalReserved: bal?.totalReserved ?? 0,
    totalPaid: bal?.totalPaid ?? 0,
    totalAvailable: bal?.totalAvailable ?? 0,
    commitmentsCount: p.commitments.length,
    documentsCount: p.documents.length,
    updatedAt: p.updatedAt.toISOString(),
    origemPlanejamentoUrl: `${origemBaseUrl()}/planejamento/${p.id}`,
    origemPainelUrl: `${origemBaseUrl()}/painel`,
  };
}

export async function listHubProjectSummaries(
  workspaceId: string,
): Promise<HubProjectSummary[]> {
  const rows = await prisma.planningProject.findMany({
    where: {
      workspaceId,
      lifecycleStatus: "EM_ANDAMENTO",
    },
    orderBy: [{ name: "asc" }, { externalCode: "asc" }],
    include: {
      account: { select: { name: true } },
      ruleset: { select: { sourceCode: true, version: true } },
      project: { select: { situacao: true } },
      sheet: {
        include: {
          lines: { select: { id: true, approvedAmount: true } },
        },
      },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
      documents: { select: { id: true } },
    },
  });

  const codeCount = new Map<string, number>();
  for (const r of rows) {
    const key = toHubSlugBase(r.externalCode) || r.id;
    codeCount.set(key, (codeCount.get(key) || 0) + 1);
  }
  const colliding = new Set(
    [...codeCount.entries()].filter(([, n]) => n > 1).map(([k]) => k),
  );

  return rows.map((r) =>
    toSummary(
      {
        id: r.id,
        externalCode: r.externalCode,
        name: r.name,
        lifecycleStatus: r.lifecycleStatus,
        jurisdiction: r.jurisdiction,
        importSource: r.importSource,
        updatedAt: r.updatedAt,
        rulesetVersion: r.rulesetVersion,
        account: r.account,
        ruleset: r.ruleset,
        project: r.project,
        sheet: r.sheet
          ? {
              totalApproved: r.sheet.totalApproved,
              lines: r.sheet.lines,
            }
          : null,
        commitments: r.commitments,
        documents: r.documents,
      },
      hubProjectSlug(r.externalCode, r.id, colliding),
    ),
  );
}

export async function getHubProjectBySlug(
  workspaceId: string,
  slug: string,
): Promise<HubProjectSummary | null> {
  const rows = await prisma.planningProject.findMany({
    where: { workspaceId },
    include: {
      account: { select: { name: true } },
      ruleset: { select: { sourceCode: true, version: true } },
      project: { select: { situacao: true } },
      sheet: {
        include: {
          lines: { select: { id: true, approvedAmount: true } },
        },
      },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
      documents: { select: { id: true } },
    },
  });

  const codeCount = new Map<string, number>();
  for (const r of rows) {
    const key = toHubSlugBase(r.externalCode) || r.id;
    codeCount.set(key, (codeCount.get(key) || 0) + 1);
  }
  const colliding = new Set(
    [...codeCount.entries()].filter(([, n]) => n > 1).map(([k]) => k),
  );

  const summaries = rows.map((r) =>
    toSummary(
      {
        id: r.id,
        externalCode: r.externalCode,
        name: r.name,
        lifecycleStatus: r.lifecycleStatus,
        jurisdiction: r.jurisdiction,
        importSource: r.importSource,
        updatedAt: r.updatedAt,
        rulesetVersion: r.rulesetVersion,
        account: r.account,
        ruleset: r.ruleset,
        project: r.project,
        sheet: r.sheet
          ? {
              totalApproved: r.sheet.totalApproved,
              lines: r.sheet.lines,
            }
          : null,
        commitments: r.commitments,
        documents: r.documents,
      },
      hubProjectSlug(r.externalCode, r.id, colliding),
    ),
  );

  return (
    summaries.find((p) => p.slug === slug || p.id === slug || p.code === slug) || null
  );
}
