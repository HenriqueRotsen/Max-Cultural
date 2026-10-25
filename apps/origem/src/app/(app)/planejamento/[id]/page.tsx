import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BudgetTree } from "@/components/planning/BudgetTree";
import { PlanningProjectActions } from "@/components/planning/PlanningProjectActions";
import type { EditableRubricLine } from "@/components/planning/EditRubricsPanel";
import { CaptacaoPanel } from "@/components/planning/CaptacaoPanel";
import { PlanningKpiStrip } from "@/components/planning/PlanningKpiStrip";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import {
  canCloseProject,
  canEditRubricas,
  canReadequacao,
} from "@/lib/planning/acl";
import { CloseProjectButton } from "@/components/planning/CloseProjectButton";
import { StateBudgetEditor } from "@/components/planning/StateBudgetEditor";
import { dismissReadequadaNotice } from "@/lib/planning/project-actions";
import {
  importSourceLabel,
  isFederalPlanning,
  jurisdictionLabel,
  lifecycleLabel,
} from "@/lib/planning/lifecycle";
import { loadPublishedPaidByLine } from "@/lib/planning/federal/published-paid";
import { computeProjectBalance, isAdminProduct } from "@/lib/planning/rubric-balance";
import { FieldHelp } from "@/components/FieldHelp";
import { HELP } from "@/lib/help";

export const dynamic = "force-dynamic";

function money(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

export default async function PlanningProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      account: { select: { name: true } },
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID"] } },
        select: {
          id: true,
          budgetLineId: true,
          amount: true,
          status: true,
          allocationSharePct: true,
          nfPending: true,
        },
        orderBy: { createdAt: "desc" },
      },
      readequacaoDrafts: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, expiresAt: true },
      },
    },
  });
  if (!project) notFound();

  const valorCaptado = money(project.valorCaptado);
  const publishedPaidByLine = await loadPublishedPaidByLine(project.id);
  const { loadLockedLineIds } = await import("@/lib/planning/hierarchy-lock-db");
  const lockData = project.sheet
    ? await loadLockedLineIds(project.sheet.id, project.sheet.lines)
    : { locks: [], lockedLineIds: new Set<string>() };
  const bal = project.sheet
    ? computeProjectBalance({
        lines: project.sheet.lines,
        commitments: project.commitments,
        valorCaptado,
        captadoRecebido: project.captadoRecebido,
        captadoTransferido: project.captadoTransferido,
        rendimentos: project.rendimentos,
        publishedPaidByLine,
        lockedLineIds: lockData.lockedLineIds,
      })
    : null;
  const allowEditRubricas = await canEditRubricas();
  const isFederal = isFederalPlanning(project.jurisdiction);
  const allowReadequacao = await canReadequacao();
  const closed = project.lifecycleStatus === "ENCERRADO";
  const allowClose = !project.closedAt && (await canCloseProject());
  const [sheetVersionCount, evaluationPending] = await Promise.all([
    prisma.projectBudgetSheetVersion.count({ where: { planningProjectId: project.id } }),
    allowClose
      ? prisma.rubricCommitment.count({
          where: {
            planningProjectId: project.id,
            status: "PAID",
            engagement: { evaluatedAt: null },
          },
        })
      : Promise.resolve(0),
  ]);
  const showReadequadaNotice = Boolean(project.readequadaAppliedAt && !project.readequadaNoticeSeenAt);

  const editableLines: EditableRubricLine[] =
    project.sheet && bal
      ? project.sheet.lines.map((l) => ({
          id: l.id,
          sortOrder: l.sortOrder,
          locked: lockData.lockedLineIds.has(l.id),
          itemName: l.itemName,
          stageName: l.stageName,
          productName: l.productName,
          city: l.city,
          state: l.state,
          homologatedAmount: money(l.homologatedAmount),
          approvedAmount: money(l.approvedAmount),
          reserved: bal.lines.get(l.id)?.reserved ?? 0,
          isAdmin: isAdminProduct(l.productName),
        }))
      : [];

  const pctLabel = bal
    ? `${(bal.pctCaptadoT * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
    : undefined;
  const openDraft = project.readequacaoDrafts[0] || null;

  return (
    <div className={`space-y-5 ${closed ? "opacity-95" : ""}`}>
      <PageHeader
        backHref="/planejamento"
        backLabel="Voltar aos projetos"
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> / {project.externalCode}
          </>
        }
        title={project.name || project.externalCode}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                closed
                  ? "bg-[var(--gray-100)] text-[var(--gray-500)]"
                  : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {lifecycleLabel(project.lifecycleStatus)}
            </span>
            <span>
              {jurisdictionLabel(project.jurisdiction)} · {project.account.name}
            </span>
            {project.importSource ? (
              <FieldHelp text={`Fonte: ${importSourceLabel(project.importSource)}`} />
            ) : null}
          </span>
        }
      />

      {showReadequadaNotice ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--gold-border)] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--navy)]">
          <span>
            Este projeto passou a usar a <strong>planilha readequada</strong> do SALIC em{" "}
            {project.readequadaAppliedAt!.toLocaleDateString("pt-BR")}. As reservas e pagamentos
            foram mantidos.
          </span>
          <span className="flex items-center gap-2">
            <Link href={`/planejamento/${project.id}/planilhas`} className="btn btn-ghost">
              Ver planilha anterior
            </Link>
            <form action={dismissReadequadaNotice.bind(null, project.id)}>
              <button type="submit" className="btn">
                Entendi
              </button>
            </form>
          </span>
        </div>
      ) : null}

      {sheetVersionCount > 0 || allowClose ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {sheetVersionCount > 0 ? (
            <Link href={`/planejamento/${project.id}/planilhas`} className="btn btn-ghost">
              Planilhas do SALIC
            </Link>
          ) : null}
          {allowClose ? (
            <CloseProjectButton
              projectId={project.id}
              externalCode={project.externalCode}
              projectName={project.name || project.externalCode}
              summary={{
                openReservations: project.commitments.filter((c) => c.status === "RESERVED").length,
                nfPending: project.commitments.filter((c) => c.nfPending).length,
                evaluationPending,
              }}
            />
          ) : null}
        </div>
      ) : null}

      <PlanningProjectActions
        projectId={project.id}
        reservationsCount={project.commitments.length}
        allowEditRubricas={allowEditRubricas && Boolean(project.sheet)}
        allowReadequacao={allowReadequacao && Boolean(project.sheet)}
        isFederal={isFederal}
        openDraftId={openDraft?.id ?? null}
        expiresAt={openDraft?.expiresAt?.toISOString() ?? null}
        editableLines={editableLines}
        totalApproved={project.sheet ? money(project.sheet.totalApproved) : 0}
      />

      {!isFederal ? (
        <StateBudgetEditor
          projectId={project.id}
          uf={project.jurisdiction}
          canEdit={allowEditRubricas}
          lines={(project.sheet?.lines || []).map((l) => {
            const reserved = project.commitments
              .filter((c) => c.budgetLineId === l.id)
              .reduce((sum, c) => sum + money(c.amount), 0);
            return {
              id: l.id,
              fonteRecurso: l.fonteRecurso,
              productName: l.productName,
              stageName: l.stageName,
              state: l.state,
              city: l.city,
              itemName: l.itemName,
              unit: l.unit,
              quantity: money(l.quantity),
              occurrences: money(l.occurrences),
              unitPrice: money(l.unitPrice),
              approvedAmount: money(l.approvedAmount),
              reserved,
              inUse: reserved > 0,
            };
          })}
        />
      ) : null}

      {bal && project.sheet ? (
        <>
          <PlanningKpiStrip
            items={[
              {
                label: "Aprovado (MinC)",
                value: formatCurrency(
                  bal.totalApproved > 0
                    ? bal.totalApproved
                    : money(project.sheet.totalApproved),
                ),
                help: HELP.planningAprovado,
              },
              {
                label: `Teto (${pctLabel || "—"})`,
                value: formatCurrency(bal.totalAvailableCap),
                help: HELP.planningTetoProjeto,
                emphasize: true,
              },
              {
                label: "Reservado",
                value: formatCurrency(bal.totalReserved),
              },
              {
                label: "Pago",
                value: formatCurrency(bal.totalPaid),
              },
              {
                label: "Saldo",
                value: formatCurrency(bal.totalSaldo),
                help: HELP.planningSaldoProjeto,
              },
            ]}
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--navy)]">
              Planilha orçamentária
            </h2>
            <BudgetTree
              lines={project.sheet.lines}
              balances={bal.lines}
              locks={lockData.locks}
              planningProjectId={project.id}
              sheetId={project.sheet.id}
              canToggleLocks={allowEditRubricas && !closed}
              pctCaptadoTLabel={pctLabel}
            />
          </section>

          <div className="space-y-3">
            <CaptacaoPanel
              planningProjectId={project.id}
              valorCaptado={valorCaptado}
              captadoRecebido={
                project.captadoRecebido != null
                  ? money(project.captadoRecebido)
                  : null
              }
              captadoTransferido={
                project.captadoTransferido != null
                  ? money(project.captadoTransferido)
                  : null
              }
              rendimentos={
                project.rendimentos != null ? money(project.rendimentos) : null
              }
              pctCaptadoT={bal.pctCaptadoT}
              operableBase={bal.operableBase}
              isFederal={isFederal}
            />
          </div>
        </>
      ) : (
        <div className="card p-5 text-sm text-[var(--gray-500)]">
          Planilha ainda não importada. Use{" "}
          <Link href="/planejamento/novo" className="text-[var(--gold)] hover:underline">
            Novo projeto
          </Link>{" "}
          com o mesmo PRONAC para importar a planilha homologada pela área logada.
        </div>
      )}
    </div>
  );
}
