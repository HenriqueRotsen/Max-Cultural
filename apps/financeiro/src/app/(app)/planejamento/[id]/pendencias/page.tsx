import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ResolvePendenciaButton } from "@/components/planning/ResolvePendenciaButton";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCgccpf, formatCurrency, formatDate } from "@/lib/format";
import { loadSalicPendencias } from "@/lib/planning/salic-pendencias";
import { formatRubricShortLabel } from "@/lib/planning/rubric-label";

export const dynamic = "force-dynamic";

export default async function PendenciasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: {
      id: true,
      externalCode: true,
      name: true,
      sheet: { select: { lines: { select: { id: true, sortOrder: true, itemName: true } } } },
    },
  });
  if (!project) notFound();
  const { semLancamento, excluidos } = await loadSalicPendencias(project.id, entitlements.workspaceId);
  const lineLabel = (lineId: string | null, fallback: string | null) => {
    const line = project.sheet?.lines.find((l) => l.id === lineId);
    return line ? formatRubricShortLabel(line) : (fallback ?? "rubrica não identificada");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${project.id}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${project.id}`}>{project.externalCode}</Link> / Pendências
          </>
        }
        title="Pendências"
        description="O que está diferente entre o SALIC e o sistema. A lista é atualizada na busca diária e no botão Conferir SALIC das Reservas."
      />

      {semLancamento.length === 0 && excluidos.length === 0 ? (
        <div className="card p-5 text-sm text-emerald-700">Nenhuma pendência com o SALIC neste projeto.</div>
      ) : null}

      {semLancamento.length > 0 ? (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="font-semibold text-[var(--navy)]">
              Pagos no SALIC sem lançamento no sistema{" "}
              <span className="text-[var(--gray-400)]">· {semLancamento.length}</span>
            </h2>
            <p className="text-xs text-[var(--gray-500)]">
              Anexe a NF/RPA e o comprovante de cada um. O pagamento já está no SALIC: nada é
              enviado de novo, e o saldo não conta duas vezes.
            </p>
          </div>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {semLancamento.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--navy)]">{r.supplierName}</p>
                  <p className="text-xs text-[var(--gray-500)]">
                    {formatCgccpf(r.supplierDoc)} · {lineLabel(r.budgetLineId, r.rubricItem)}
                    {r.paymentDate ? ` · pago em ${r.paymentDate}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatCurrency(Number(r.amount))}</span>
                  <Link href={`/planejamento/${project.id}/pendencias/${r.id}`} className="btn">
                    Anexar NF e comprovante
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {excluidos.length > 0 ? (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="font-semibold text-[var(--navy)]">
              Excluídos no SALIC, ainda lançados no sistema{" "}
              <span className="text-[var(--gray-400)]">· {excluidos.length}</span>
            </h2>
            <p className="text-xs text-[var(--gray-500)]">
              O comprovante sumiu do SALIC. Se foi engano, envie de novo pelas Reservas. Se vai
              continuar assim, marque como resolvida e diga o motivo.
            </p>
          </div>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {excluidos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--navy)]">{r.supplierName}</p>
                  <p className="text-xs text-[var(--gray-500)]">
                    {lineLabel(r.budgetLineId, r.rubricItem)} · saiu do SALIC em{" "}
                    {formatDate(r.removedAt!)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatCurrency(Number(r.amount))}</span>
                  {r.commitmentId ? (
                    <Link href={`/planejamento/compromissos/${r.commitmentId}`} className="btn btn-ghost">
                      Abrir lançamento
                    </Link>
                  ) : null}
                  <Link href={`/planejamento/${project.id}/reservas`} className="btn btn-ghost">
                    Enviar de novo
                  </Link>
                  <ResolvePendenciaButton recordId={r.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
