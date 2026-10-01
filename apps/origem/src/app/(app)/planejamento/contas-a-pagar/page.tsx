import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ContasAPagarPanel } from "@/components/planning/ContasAPagarPanel";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { refreshPaymentDueNotifications } from "@/lib/planning/actions";
import type {
  ContasAPagarDueFilter,
  ContasAPagarRow,
} from "@/lib/planning/contas-a-pagar";
import { getNotificationPrefs } from "@/lib/planning/notification-prefs";
import { formatRubricShortLabel } from "@/lib/planning/rubric-label";

export const dynamic = "force-dynamic";

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ due?: string; c?: string }>;
}) {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const { due: dueRaw = "", c: highlightCommitmentId = "" } = await searchParams;

  await refreshPaymentDueNotifications({ force: true }).catch(() => undefined);

  const prefs = await getNotificationPrefs(
    entitlements.workspaceId,
    session.id,
  );

  const initialDue: ContasAPagarDueFilter = (
    ["all", "overdue", "upcoming", "later"] as ContasAPagarDueFilter[]
  ).includes(dueRaw as ContasAPagarDueFilter)
    ? (dueRaw as ContasAPagarDueFilter)
    : "all";

  const commitments = await prisma.rubricCommitment.findMany({
    where: {
      workspaceId: entitlements.workspaceId,
      status: "RESERVED",
    },
    include: {
      planningProject: { select: { id: true, externalCode: true, name: true } },
      budgetLine: {
        select: {
          itemName: true,
          stageName: true,
          productName: true,
          sortOrder: true,
        },
      },
      engagement: {
        include: {
          service: {
            include: { supplier: { select: { name: true, cnpj: true } } },
          },
        },
      },
      pedido: { select: { id: true, description: true } },
    },
    orderBy: [{ expectedPayAt: "asc" }, { createdAt: "asc" }],
  });

  const rows: ContasAPagarRow[] = commitments.map((c) => ({
    id: c.id,
    amount: Number(c.amount),
    expectedPayAt: c.expectedPayAt.toISOString(),
    status: c.status,
    installmentNumber: c.installmentNumber,
    planningProjectId: c.planningProject.id,
    externalCode: c.planningProject.externalCode,
    projectName: c.planningProject.name,
    supplierName: c.engagement.service.supplier.name,
    supplierCnpj: c.engagement.service.supplier.cnpj,
    rubricLabel: formatRubricShortLabel(c.budgetLine),
    origin: c.pedido ? "pedido" : "reserva",
    pedidoId: c.pedido?.id ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> / Contas a pagar
          </>
        }
        title="Contas a pagar"
        description={`Prazos alinhados aos avisos · janela de ${prefs.dueSoonDaysAhead} dia(s).`}
        actions={
          <Link href="/notificacoes" className="btn btn-ghost">
            Ver avisos
          </Link>
        }
      />
      <ContasAPagarPanel
        rows={rows}
        dueSoonDays={prefs.dueSoonDaysAhead}
        initialDue={initialDue}
        highlightCommitmentId={highlightCommitmentId || null}
      />
    </div>
  );
}
