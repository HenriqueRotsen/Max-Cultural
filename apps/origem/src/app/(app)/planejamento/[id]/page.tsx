import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BudgetTree } from "@/components/planning/BudgetTree";
import {
  EditRubricsPanel,
  type EditableRubricLine,
} from "@/components/planning/EditRubricsPanel";
import { SalicPublishPanel } from "@/components/planning/SalicPublishPanel";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { canExceedRubric, canPublishToSalic } from "@/lib/planning/acl";
import {
  assessSalicPublishReadiness,
  commitmentStatusLabel,
  importSourceLabel,
  jurisdictionLabel,
  lifecycleLabel,
} from "@/lib/planning/lifecycle";
import { computeProjectBalance } from "@/lib/planning/rubric-balance";

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
        select: { id: true, budgetLineId: true, amount: true, status: true },
        orderBy: { createdAt: "desc" },
      },
      documents: { select: { kind: true, status: true } },
      project: { select: { situacao: true } },
    },
  });
  if (!project) notFound();

  const bal = project.sheet
    ? computeProjectBalance({
        lines: project.sheet.lines,
        commitments: project.commitments,
      })
    : null;
  const allowExceed = await canExceedRubric();
  const allowPublish = await canPublishToSalic();
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
        }))
      : [];

  return (
    <div className={`space-y-6 ${closed ? "opacity-95" : ""}`}>
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> / {project.externalCode}
          </>
        }
        title={project.name || project.externalCode}
        description={
          <>
            <span
              className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                closed
                  ? "bg-[var(--gray-100)] text-[var(--gray-500)]"
                  : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {lifecycleLabel(project.lifecycleStatus)}
            </span>
            {jurisdictionLabel(project.jurisdiction)} · {project.account.name} ·{" "}
            {importSourceLabel(project.importSource)}
            {project.project?.situacao ? ` · ${project.project.situacao}` : ""}
          </>
        }
        actions={
          project.sheet ? (
            <div className="flex flex-wrap items-center gap-2">
              {allowExceed && bal ? (
                <EditRubricsPanel
                  planningProjectId={project.id}
                  totalApproved={money(project.sheet.totalApproved)}
                  lines={editableLines}
                />
              ) : null}
              <Link href={`/planejamento/${project.id}/nf/nova`} className="btn">
                Subir NF
              </Link>
            </div>
          ) : null
        }
      />

      {bal ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat
            label="Aprovado"
            value={formatCurrency(
              bal.totalApproved > 0
                ? bal.totalApproved
                : money(project.sheet?.totalApproved),
            )}
          />
          <Stat label="Reservado" value={formatCurrency(bal.totalReserved)} />
          <Stat label="Pago" value={formatCurrency(bal.totalPaid)} />
          <Stat label="Saldo" value={formatCurrency(bal.totalAvailable)} />
        </div>
      ) : null}

      {allowExceed ? <div data-edit-rubrics-slot /> : null}

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

      {project.sheet && bal ? (
        <BudgetTree lines={project.sheet.lines} balances={bal.lines} />
      ) : (
        <div className="card p-5 text-sm text-[var(--gray-500)]">
          Planilha ainda não importada. Use{" "}
          <Link href="/planejamento/novo" className="text-[var(--gold)] hover:underline">
            Novo projeto
          </Link>{" "}
          com o mesmo PRONAC para importar a planilha homologada pela área logada.
        </div>
      )}

      {project.commitments.length > 0 ? (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-[var(--navy)]">Reservas recentes</h2>
          <ul className="space-y-2 text-sm">
            {project.commitments.slice(0, 12).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/planejamento/compromissos/${c.id}`}
                  className="text-[var(--gold)] hover:underline"
                >
                  {commitmentStatusLabel(c.status)} · {formatCurrency(Number(c.amount))}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[var(--gray-400)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--navy)]">{value}</p>
    </div>
  );
}
