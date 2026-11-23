import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCgccpf, formatCurrency, formatDate } from "@/lib/format";
import { loadProjectCredits } from "@/lib/planning/credits-db";
import {
  CreditCreateForm,
  CreditDeleteButton,
  CreditUseUndoButton,
} from "@/components/planning/CreditForms";

export const dynamic = "force-dynamic";

/**
 * Créditos do projeto: pagamentos feitos sem nota, ainda sem rubrica. Cada
 * nota do fornecedor usa uma parte, na reserva dela ("Pagar com crédito").
 */
export default async function CreditosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true, closedAt: true },
  });
  if (!project) notFound();
  const credits = await loadProjectCredits(project.id, entitlements.workspaceId);
  const totalLeft = credits.reduce((s, c) => s + c.remaining, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${project.id}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${project.id}`}>{project.externalCode}</Link> / Créditos
          </>
        }
        title="Créditos"
        description="Pagamento feito antes das notas (ex.: uma TED para o hotel que cobre várias notas). O crédito não entra em rubrica nem no SALIC; cada nota do fornecedor usa uma parte, na reserva dela."
      />

      {!project.closedAt ? (
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold text-[var(--navy)]">Novo crédito</h2>
          <CreditCreateForm planningProjectId={project.id} />
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--navy)]">Créditos do projeto</h2>
          {credits.length > 0 ? (
            <p className="text-sm text-[var(--gray-600)]">
              Disponível: <strong className="text-[var(--navy)]">{formatCurrency(totalLeft)}</strong>
            </p>
          ) : null}
        </div>
        {credits.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--gray-500)]">
            Nenhum crédito. Registre aqui um pagamento que ainda não tem nota.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {credits.map((c) => (
              <li key={c.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--navy)]">{c.supplierName}</p>
                    <p className="text-xs text-[var(--gray-500)]">
                      {formatCgccpf(c.supplierDoc)} · pago em {formatDate(c.paidAt)} ·{" "}
                      <a href={`/api/planning/documents/${c.id}`} target="_blank" className="hover:underline">
                        comprovante
                      </a>
                      {c.notes ? ` · ${c.notes}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p>
                      Pago <strong>{formatCurrency(c.amount)}</strong>
                    </p>
                    <p className={c.remaining > 0.005 ? "text-emerald-700" : "text-[var(--gray-500)]"}>
                      {c.remaining > 0.005 ? `Disponível ${formatCurrency(c.remaining)}` : "Usado por inteiro"}
                    </p>
                    {c.uses.length === 0 && !project.closedAt ? <CreditDeleteButton creditId={c.id} /> : null}
                  </div>
                </div>
                {c.uses.length > 0 ? (
                  <ul className="space-y-1 rounded-lg bg-[var(--gray-50)] px-3 py-2 text-sm">
                    {c.uses.map((u) => (
                      <li key={u.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {u.commitmentId ? (
                            <Link href={`/planejamento/compromissos/${u.commitmentId}`} className="hover:underline">
                              {u.nfLabel}
                            </Link>
                          ) : (
                            u.nfLabel
                          )}
                          {u.inSalic ? <span className="ml-2 text-xs text-emerald-700">no SALIC</span> : null}
                        </span>
                        <span className="flex items-center gap-3">
                          <strong className="tabular-nums">{formatCurrency(u.amount)}</strong>
                          {!u.inSalic && !project.closedAt ? (
                            <CreditUseUndoButton useId={u.id} amount={u.amount} />
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
