import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function pedidoStatusLabel(status: string) {
  if (status === "OPEN") return "Aberto";
  if (status === "FULFILLED") return "Com NF";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

export default async function PedidosListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true },
  });
  if (!project) notFound();

  const pedidos = await prisma.planningPedido.findMany({
    where: {
      planningProjectId: id,
      workspaceId: entitlements.workspaceId,
    },
    include: {
      supplier: { select: { name: true, cnpj: true } },
      commitments: {
        select: { id: true, status: true, amount: true },
        orderBy: { installmentNumber: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${id}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> / Pedidos
          </>
        }
        title="Pedidos"
        description="Reservas parceladas sem NF — contas a pagar do projeto."
        actions={
          <Link href={`/planejamento/${id}/pedidos/novo`} className="btn">
            Novo pedido
          </Link>
        }
      />

      {pedidos.length === 0 ? (
        <p className="card p-5 text-sm text-[var(--gray-500)]">
          Nenhum pedido neste projeto.{" "}
          <Link
            href={`/planejamento/${id}/pedidos/novo`}
            className="font-semibold text-[var(--navy)] underline"
          >
            Criar o primeiro
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {pedidos.map((p) => {
            const paid = p.commitments.filter((c) => c.status === "PAID").length;
            return (
              <li key={p.id}>
                <Link
                  href={`/planejamento/${id}/pedidos/${p.id}`}
                  className="card flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-[#b8b0e8]"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--navy)]">
                      {p.supplier.name}
                    </p>
                    <p className="text-sm text-[var(--gray-500)]">
                      {p.description || "Sem descrição"} ·{" "}
                      {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums text-[var(--navy)]">
                      {formatCurrency(Number(p.totalAmount))}
                    </p>
                    <p className="text-xs text-[var(--gray-500)]">
                      {pedidoStatusLabel(p.status)} · {paid}/
                      {p.commitments.length} paga(s)
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
