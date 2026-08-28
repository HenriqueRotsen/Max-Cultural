import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BudgetTree } from "@/components/planning/BudgetTree";
import {
  EditRubricsPanel,
  type EditableRubricLine,
} from "@/components/planning/EditRubricsPanel";
import { CaptacaoPanel } from "@/components/planning/CaptacaoPanel";
import { SalicPublishPanel } from "@/components/planning/SalicPublishPanel";
import { ReadequacaoActions } from "@/components/planning/ReadequacaoActions";
import { PlanningKpiStrip } from "@/components/planning/PlanningKpiStrip";
import { PlanningProjectToolbar } from "@/components/planning/PlanningProjectToolbar";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import {
  canExceedRubric,
  canPublishToSalic,
  canReadequacao,
} from "@/lib/planning/acl";
import {
  assessSalicPublishReadiness,
  importSourceLabel,
  jurisdictionLabel,
  lifecycleLabel,
} from "@/lib/planning/lifecycle";
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
        },
        orderBy: { createdAt: "desc" },
      },
      documents: { select: { kind: true, status: true } },
      project: { select: { situacao: true, valorCaptado: true } },
      readequacaoDrafts: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, expiresAt: true },
      },
    },
  });
  if (!project) notFound();

  const valorCaptado = money(project.project?.valorCaptado);
  const bal = project.sheet
    ? computeProjectBalance({
        lines: project.sheet.lines,
        commitments: project.commitments,
        valorCaptado,
        captadoRecebido: project.captadoRecebido,
        captadoTransferido: project.captadoTransferido,
        rendimentos: project.rendimentos,
      })
    : null;
  const allowExceed = await canExceedRubric();
  const allowPublish = await canPublishToSalic();
  const allowReadequacao = await canReadequacao();
  const readiness = assessSalicPublishReadiness({
    hasSheet: Boolean(project.sheet),
    documents: project.documents,
    commitments: project.commitments,
  });
  const closed = project.lifecycleStatus === "ENCERRADO";
  const confirmLabel = project.name?.trim() || project.externalCode;

  const editableLines: EditableRubricLine[] =
    project.sheet && bal
      ? project.sheet.lines.map((l) => ({
          id: l.id,
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
  const hasAdvancedTools = allowExceed || allowReadequacao;

  return (
    <div className={`space-y-5 ${closed ? "opacity-95" : ""}`}>
      <PageHeader
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
            {project.project?.situacao || project.importSource ? (
              <FieldHelp
                text={[
                  project.importSource
                    ? `Fonte: ${importSourceLabel(project.importSource)}`
                    : null,
                  project.project?.situacao
                    ? `Situação SALIC: ${project.project.situacao}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
          </span>
        }
      />

      {bal && project.sheet ? (
        <>
          <PlanningProjectToolbar
            projectId={project.id}
            reservationsCount={project.commitments.length}
            moreSlot={
              hasAdvancedTools ? (
                <>
                  {allowExceed && bal ? (
                    <EditRubricsPanel
                      planningProjectId={project.id}
                      totalApproved={money(project.sheet.totalApproved)}
                      lines={editableLines}
                      menuItem
                    />
                  ) : null}
                  {allowReadequacao ? (
                    <ReadequacaoActions
                      planningProjectId={project.id}
                      openDraftId={openDraft?.id ?? null}
                      expiresAt={openDraft?.expiresAt?.toISOString() ?? null}
                      menuItem
                    />
                  ) : null}
                </>
              ) : undefined
            }
          />

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
                help: HELP.planningDisponivel,
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
                value: formatCurrency(bal.totalAvailable),
                help: HELP.planningSaldo,
              },
            ]}
          />

          {allowExceed ? <div data-edit-rubrics-slot /> : null}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--navy)]">
              Planilha orçamentária
            </h2>
            <BudgetTree
              lines={project.sheet.lines}
              balances={bal.lines}
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
              isFederal={project.jurisdiction === "FEDERAL"}
            />

            {allowPublish ? (
              <SalicPublishPanel
                planningProjectId={project.id}
                projectName={project.name || project.externalCode}
                confirmLabel={confirmLabel}
                publishStatus={project.salicPublishStatus}
                publishMessage={project.salicPublishMessage}
                readinessOk={readiness.ok}
                readinessReasons={readiness.reasons}
              />
            ) : null}
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
