import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ManualReservationForm } from "@/components/planning/ManualReservationForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  commitmentStatusLabel,
  nfPendingBadge,
} from "@/lib/planning/lifecycle";
import {
  computeProjectBalance,
  isAdminProduct,
} from "@/lib/planning/rubric-balance";
import type { RubricSelectOption } from "@/components/planning/RubricSearchSelect";

export const dynamic = "force-dynamic";

export default async function PlanningReservasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      sheet: { include: { lines: { orderBy: { sortOrder: "asc" } } } },
      project: { select: { valorCaptado: true } },
      commitments: {
        where: { status: { in: ["RESERVED", "PAID", "CANCELLED"] } },
        select: {
          id: true,
          budgetLineId: true,
          amount: true,
          status: true,
          nfPending: true,
        },
      },
    },
  });
  if (!project?.sheet) notFound();

  const valorCaptado =
    project.project?.valorCaptado != null
      ? Number(project.project.valorCaptado)
      : 0;
  const bal = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
  });

  const rubricOptions: RubricSelectOption[] = project.sheet.lines.map((l) => {
    const lineBal = bal.lines.get(l.id);
    return {
      id: l.id,
      label: `${l.stageName} · ${l.itemName}`,
      available: lineBal?.available ?? 0,
      isAdmin: isAdminProduct(l.productName),
      stageName: l.stageName,
      itemName: l.itemName,
      productName: l.productName,
      city: l.city,
      state: l.state,
      categoryHint: l.categoryHint,
    };
  });

  const commitments = await prisma.rubricCommitment.findMany({
    where: {
      planningProjectId: id,
      workspaceId: entitlements.workspaceId,
      status: { in: ["RESERVED", "PAID", "CANCELLED"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      budgetLine: {
        select: { itemName: true, stageName: true, productName: true },
      },
      engagement: {
        select: {
          service: {
            select: {
              name: true,
              supplier: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${project.id}`}>{project.externalCode}</Link>{" "}
            / Reservas
          </>
        }
        title="Reservas"
        description={project.name || project.externalCode}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/planejamento/${project.id}/pagamento-antecipado`}
              className="btn btn-ghost"
            >
              Pagamento sem NF
            </Link>
            <Link href={`/planejamento/${project.id}/nf/nova`} className="btn">
              Subir NF/RPA
            </Link>
          </div>
        }
      />

      <ManualReservationForm
        planningProjectId={project.id}
        lines={rubricOptions.filter((l) => l.available > 0 || l.isAdmin)}
      />

      {commitments.length === 0 ? (
        <div className="card px-5 py-12 text-center text-sm text-[var(--gray-500)]">
          Nenhuma reserva ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {commitments.map((c) => {
            const supplier = c.engagement.service.supplier.name;
            const service = c.engagement.service.name;
            return (
              <div
                key={c.id}
                className={`card flex flex-wrap items-center justify-between gap-4 p-5 ${
                  c.nfPending ? "border-red-200 bg-red-50/40" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--navy)]">
                    {commitmentStatusLabel(c.status)} ·{" "}
                    <span className="tabular-nums">
                      {formatCurrency(Number(c.amount))}
                    </span>
                    {c.nfPending ? (
                      <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                        {nfPendingBadge()}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-[var(--gray-500)]">
                    {supplier} · {service}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--gray-400)]">
                    {c.budgetLine.stageName} · {c.budgetLine.itemName}
                    {" · "}
                    {formatDate(c.createdAt)}
                    {c.paidAt ? ` · pago ${formatDate(c.paidAt)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {c.nfPending ? (
                    <Link
                      href={`/planejamento/compromissos/${c.id}/anexar-nf`}
                      className="btn"
                    >
                      Anexar NF
                    </Link>
                  ) : c.status === "RESERVED" ? (
                    <Link
                      href={`/planejamento/compromissos/${c.id}`}
                      className="btn"
                    >
                      Subir comprovante
                    </Link>
                  ) : (
                    <Link
                      href={`/planejamento/compromissos/${c.id}`}
                      className="btn btn-ghost"
                    >
                      Abrir
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
