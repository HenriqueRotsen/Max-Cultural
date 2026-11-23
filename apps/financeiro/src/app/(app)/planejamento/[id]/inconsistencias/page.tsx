import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { loadProjectFines } from "@/lib/planning/inconsistencias";

export const dynamic = "force-dynamic";

/**
 * Relatório de inconsistências do projeto: o que saiu da conta e não pode ser
 * custeado pelo projeto (multas e juros), para devolver e prestar contas.
 */
export default async function InconsistenciasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true, name: true },
  });
  if (!project) notFound();
  const fines = await loadProjectFines({ workspaceId: entitlements.workspaceId, planningProjectId: project.id });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${project.id}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${project.id}`}>{project.externalCode}</Link> / Inconsistências
          </>
        }
        title="Inconsistências"
        description="O que saiu da conta do projeto e não pode ser custeado por ele, para devolver e entrar na prestação de contas."
      />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--navy)]">Multas e juros</h2>
          {fines.rows.length > 0 ? (
            <p className="text-sm text-[var(--gray-600)]">
              A devolver: <strong className="text-[var(--navy)]">{formatCurrency(fines.total)}</strong>
            </p>
          ) : null}
        </div>
        {fines.rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--gray-500)]">
            Nenhum pagamento com multa ou juros. Eles aparecem aqui quando o comprovante é maior que a nota e a
            diferença é marcada como multa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Pago em</th>
                  <th>Fornecedor</th>
                  <th>Nota</th>
                  <th className="num">Valor da nota</th>
                  <th className="num">Pago</th>
                  <th className="num">Multa/juros</th>
                </tr>
              </thead>
              <tbody>
                {fines.rows.map((r) => (
                  <tr key={r.proofId}>
                    <td className="whitespace-nowrap">{r.paidAt ? formatDate(r.paidAt) : "—"}</td>
                    <td>
                      {r.commitmentId ? (
                        <Link href={`/planejamento/compromissos/${r.commitmentId}`} className="hover:underline">
                          {r.supplierName}
                        </Link>
                      ) : (
                        r.supplierName
                      )}
                    </td>
                    <td>{r.documentNumber || "—"}</td>
                    <td className="num">{formatCurrency(r.nfAmount)}</td>
                    <td className="num">{formatCurrency(r.paidAmount)}</td>
                    <td className="num font-semibold">{formatCurrency(r.fineAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
