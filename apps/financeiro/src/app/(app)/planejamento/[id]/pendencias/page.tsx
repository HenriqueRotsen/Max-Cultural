import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ResolvePendenciaButton } from "@/components/planning/ResolvePendenciaButton";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCgccpf, formatCurrency, formatDate } from "@/lib/format";
import { loadSalicPendencias } from "@/lib/planning/salic-pendencias";
import { loadFinancialPendencias } from "@/lib/planning/financial-pendencias";
import { List } from "@/components/planning/OtherPendencies";
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
  const [{ semLancamento, excluidos }, fin] = await Promise.all([
    loadSalicPendencias(project.id, entitlements.workspaceId),
    loadFinancialPendencias({ workspaceId: entitlements.workspaceId, planningProjectId: project.id }),
  ]);
  const vencidas = fin.aPagar.filter((i) => i.late);
  const aVencer = fin.aPagar.filter((i) => !i.late);
  const comprovacoes =
    fin.pagosSemNf.length + fin.impostos.length + fin.enviarSalic.length +
    semLancamento.length + excluidos.length;
  const nothing =
    fin.aPagar.length + fin.pagosSemNf.length + fin.impostos.length + fin.enviarSalic.length +
      semLancamento.length + excluidos.length === 0;
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
        description="O que falta pagar, regularizar ou enviar neste projeto, do mais urgente para o menos. É o Contas a pagar só deste projeto."
      />

      {nothing ? (
        <div className="card p-5 text-sm text-emerald-700">Nenhuma pendência financeira neste projeto.</div>
      ) : null}

      {vencidas.length + aVencer.length > 0 ? (
        <h2 className="text-lg font-semibold text-[var(--navy)]">A pagar</h2>
      ) : null}
      <List
        title="Vencidas"
        hint="Reservas com a data prevista de pagamento já passada. Pague e envie o comprovante, ou ajuste a data."
        items={vencidas}
        limit={500}
      />
      <List
        title="A vencer"
        hint="Reservas ainda não pagas, pela data prevista."
        items={aVencer}
        limit={500}
      />

      {comprovacoes > 0 ? (
        <div>
          <h2 className="text-lg font-semibold text-[var(--navy)]">Comprovações</h2>
          <p className="text-sm text-[var(--gray-500)]">
            O que falta para o que está no sistema bater com o SALIC: documentos de pagamentos feitos,
            e diferenças entre o sistema e o SALIC nos dois sentidos.
          </p>
        </div>
      ) : null}
      {semLancamento.length > 0 ? (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="font-semibold text-[var(--navy)]">
              Pagos no SALIC sem lançamento aqui{" "}
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
              Excluídos no SALIC, ainda lançados aqui{" "}
              <span className="text-[var(--gray-400)]">· {excluidos.length}</span>
            </h2>
            <p className="text-xs text-[var(--gray-500)]">
              O pagamento sumiu do SALIC, mas continua no sistema (e no saldo). Envie de novo, exclua
              o pagamento aqui (no lançamento, &quot;Excluir pagamento&quot;) ou, se vai continuar assim, marque
              como resolvida e diga o motivo.
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

      <List
        title="Pagos sem NF/RPA"
        hint="Pagamentos feitos que esperam a nota (ou fatura, recibo ou apólice no lugar dela). A data é o lembrete combinado."
        items={fin.pagosSemNf}
        limit={500}
      />
      <List
        title="Impostos retidos sem guia"
        hint="NF/RPA com retenção e sem guia anexada. A data é o vencimento típico."
        items={fin.impostos}
        limit={500}
      />
      <List
        title="Para enviar ao SALIC"
        hint="Pagamentos com comprovante que ainda não foram ao SALIC, ou que precisam ser reenviados com um documento novo."
        items={fin.enviarSalic}
        limit={500}
      />
    </div>
  );
}
