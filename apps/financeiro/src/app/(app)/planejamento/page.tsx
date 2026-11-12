import Link from "next/link";
import { PageHeader } from "@/components/ui";
import {
  PlanningProjectList,
  type PlanningProjectCard,
} from "@/components/planning/PlanningProjectList";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { computeProjectBalance } from "@/lib/planning/rubric-balance";

export const dynamic = "force-dynamic";

function money(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (
    typeof v === "object" &&
    typeof (v as { toNumber?: () => number }).toNumber === "function"
  ) {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

export default async function PlanejamentoIndexPage() {
  const { entitlements } = await getWorkspaceContext();

  const projects = await prisma.planningProject.findMany({
    // Encerrados somem do Financeiro.
    where: { workspaceId: entitlements.workspaceId, closedAt: null },
    orderBy: [{ name: "asc" }, { externalCode: "asc" }],
    include: {
      account: { select: { name: true } },
      sheet: { include: { lines: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: {
          budgetLineId: true,
          amount: true,
          status: true,
          nfPending: true,
          expectedPayAt: true,
        },
      },
    },
  });

  const { loadPublishedPaidByLineBatch } = await import(
    "@/lib/planning/federal/published-paid"
  );
  const publishedByProject = await loadPublishedPaidByLineBatch(
    projects.map((p) => p.id),
  );

  // Pendências por projeto: só aparecem na lista quando existem.
  const inReview = await prisma.planningDocument.groupBy({
    by: ["planningProjectId"],
    where: {
      workspaceId: entitlements.workspaceId,
      planningProjectId: { in: projects.map((p) => p.id) },
      kind: { in: ["NF", "RPA"] },
      status: "REVIEW",
    },
    _count: { _all: true },
  });
  const reviewByProject = new Map(inReview.map((r) => [r.planningProjectId, r._count._all]));
  const now = new Date();

  const cards: PlanningProjectCard[] = projects.map((p) => {
    const bal = p.sheet
      ? computeProjectBalance({
          lines: p.sheet.lines,
          commitments: p.commitments,
          valorCaptado: money(p.valorCaptado),
          captadoRecebido: p.captadoRecebido,
          rubricOverrunPct: p.rubricOverrunPct,
          captadoTransferido: p.captadoTransferido,
          rendimentos: p.rendimentos,
          publishedPaidByLine: publishedByProject.get(p.id),
        })
      : null;
    return {
      id: p.id,
      externalCode: p.externalCode,
      name: p.name,
      jurisdiction: p.jurisdiction,
      accountName: p.account.name,
      importedAt: (p.importedAt ?? p.sheet?.importedAt)?.toISOString() ?? null,
      importSource: p.importSource,
      situacao: null,
      lifecycleStatus: p.lifecycleStatus,
      totalApproved: bal?.totalApproved ?? 0,
      totalFree: bal?.totalAvailable ?? 0,
      pending: {
        overdue: p.commitments.filter(
          (c) => c.status === "RESERVED" && c.expectedPayAt < now,
        ).length,
        nfPending: p.commitments.filter((c) => c.status === "PAID" && c.nfPending).length,
        inReview: reviewByProject.get(p.id) ?? 0,
      },
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Planejamento"
        title="Projetos"
        actions={
          <Link href="/planejamento/novo" className="btn">
            Novo projeto
          </Link>
        }
      />

      <PlanningProjectList projects={cards} />
    </div>
  );
}
