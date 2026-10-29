import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { CancelPedidoButton } from "@/components/planning/CancelPedidoButton";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { commitmentStatusLabel } from "@/lib/planning/lifecycle";
import { formatRubricShortLabel } from "@/lib/planning/rubric-label";

export const dynamic = "force-dynamic";

function pedidoStatusLabel(status: string) {
  if (status === "OPEN") return "Aberto (aguardando NF)";
  if (status === "FULFILLED") return "NF vinculada";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

export default async function PedidoDetailPage({
  params,
}: {
  params: Promise<{ id: string; pedidoId: string }>;
}) {
  const { id, pedidoId } = await params;
  const { entitlements } = await getWorkspaceContext();

  const pedido = await prisma.planningPedido.findFirst({
    where: {
      id: pedidoId,
      planningProjectId: id,
      workspaceId: entitlements.workspaceId,
    },
    include: {
      supplier: { select: { name: true, cnpj: true } },
      planningProject: { select: { externalCode: true } },
      sourceDocument: {
        select: { id: true, filename: true, kind: true },
      },
      commitments: {
        include: {
          budgetLine: {
            select: {
              itemName: true,
              stageName: true,
              productName: true,
              sortOrder: true,
            },
          },
        },
        orderBy: { installmentNumber: "asc" },
      },
    },
  });
  if (!pedido) notFound();

  const canCancel =
    pedido.status !== "CANCELLED" &&
    !pedido.commitments.some((c) => c.status === "PAID");

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${id}/pedidos`}
        breadcrumb={
          <>
            <Link href={`/planejamento/${id}`}>
              {pedido.planningProject.externalCode}
            </Link>{" "}
            / <Link href={`/planejamento/${id}/pedidos`}>Pedidos</Link> / Detalhe
          </>
        }
        title={pedido.supplier.name}
        description={
          pedido.description ||
          `${formatCurrency(Number(pedido.totalAmount))} · ${pedidoStatusLabel(pedido.status)}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {pedido.status === "OPEN" ? (
              <Link
                href={`/planejamento/${id}/nf/nova?attachPedidoId=${pedido.id}`}
                className="btn"
              >
                Vincular NF/RPA
              </Link>
            ) : null}
            {canCancel ? <CancelPedidoButton pedidoId={pedido.id} /> : null}
          </div>
        }
      />

      <div className="card space-y-2 p-5 text-sm">
        <p>
          <span className="text-[var(--gray-500)]">Status:</span>{" "}
          {pedidoStatusLabel(pedido.status)}
        </p>
        <p>
          <span className="text-[var(--gray-500)]">Total:</span>{" "}
          {formatCurrency(Number(pedido.totalAmount))}
        </p>
        <p>
          <span className="text-[var(--gray-500)]">Fornecedor:</span>{" "}
          {pedido.supplier.name} ({pedido.supplier.cnpj})
        </p>
        {pedido.sourceDocument ? (
          <p>
            <span className="text-[var(--gray-500)]">
              {pedido.sourceDocument.kind}:
            </span>{" "}
            {pedido.sourceDocument.filename}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--navy)]">Parcelas</h2>
        <ul className="space-y-2">
          {pedido.commitments.map((c) => (
            <li key={c.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium text-[var(--navy)]">
                  Parcela {c.installmentNumber ?? "—"} ·{" "}
                  {formatRubricShortLabel(c.budgetLine)}
                </p>
                <p className="text-sm text-[var(--gray-500)]">
                  {commitmentStatusLabel(c.status)} · previsto{" "}
                  {formatDate(c.expectedPayAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-semibold tabular-nums">
                  {formatCurrency(Number(c.amount))}
                </p>
                <Link
                  href={`/planejamento/compromissos/${c.id}`}
                  className="btn btn-ghost text-xs"
                >
                  Abrir
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
