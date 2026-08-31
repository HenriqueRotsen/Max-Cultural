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
    where: { workspaceId: entitlements.workspaceId },
    orderBy: [{ name: "asc" }, { externalCode: "asc" }],
    include: {
      account: { select: { name: true } },
      sheet: { include: { lines: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: { budgetLineId: true, amount: true, status: true },
      },
      project: { select: { situacao: true, valorCaptado: true } },
    },
  });

  const cards: PlanningProjectCard[] = projects.map((p) => {
    const bal = p.sheet
      ? computeProjectBalance({
          lines: p.sheet.lines,
          commitments: p.commitments,
          valorCaptado: money(p.project?.valorCaptado),
          captadoRecebido: p.captadoRecebido,
          captadoTransferido: p.captadoTransferido,
          rendimentos: p.rendimentos,
        })
      : null;
    return {
      id: p.id,
      externalCode: p.externalCode,
      name: p.name,
      jurisdiction: p.jurisdiction,
      accountName: p.account.name,
      importedAt: p.importedAt?.toISOString() ?? null,
      importSource: p.importSource,
      situacao: p.project?.situacao ?? null,
      lifecycleStatus: p.lifecycleStatus,
      totalApproved: bal?.totalApproved ?? 0,
      totalAvailable: bal?.totalAvailable ?? 0,
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
