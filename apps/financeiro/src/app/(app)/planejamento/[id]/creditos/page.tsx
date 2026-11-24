import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCgccpf, formatCurrency, formatDate } from "@/lib/format";
import { loadProjectCredits } from "@/lib/planning/credits-view";

export const dynamic = "force-dynamic";

/**
 * Créditos do projeto: pagamentos feitos sem nota (Nova reserva → Comprovante).
 * Cada nota anexada usa uma parte; o que sobra espera as próximas notas.
 */
export default async function CreditosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true },
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
        description="Pagamentos feitos antes da nota. Cada nota anexada usa uma parte e vira um lançamento no SALIC com o mesmo comprovante; o que sobra espera as próximas notas."
      />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--navy)]">Pagamentos sem nota</h2>
          {credits.length > 0 ? (
            <p className="text-sm text-[var(--gray-600)]">
              Aguardando nota: <strong className="text-[var(--navy)]">{formatCurrency(totalLeft)}</strong>
            </p>
          ) : null}
        </div>
        {credits.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--gray-500)]">
            Nenhum pagamento sem nota. Para registrar um, use Nova reserva → Comprovante (já pago, sem NF).
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {credits.map((c) => (
              <li key={c.proofId} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--navy)]">{c.supplierName}</p>
                    <p className="text-xs text-[var(--gray-500)]">
                      {c.supplierDoc ? `${formatCgccpf(c.supplierDoc)} · ` : ""}
                      {c.paidAt ? `pago em ${formatDate(c.paidAt)} · ` : ""}
                      <a href={`/api/planning/documents/${c.proofId}`} target="_blank" className="hover:underline">
                        comprovante
                      </a>
                    </p>
                    {c.rubricas.length > 0 ? (
                      <p className="mt-1 text-xs text-[var(--gray-600)]">
                        {c.rubricas.map((r) => `${r.name}: ${formatCurrency(r.amount)}`).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1 text-right text-sm">
                    <p>
                      Pago <strong>{formatCurrency(c.total)}</strong>
                    </p>
                    <p className={c.remaining > 0 ? "text-amber-700" : "text-emerald-700"}>
                      {c.remaining > 0 ? `Sem nota: ${formatCurrency(c.remaining)}` : "Notas completas"}
                    </p>
                    {c.remaining > 0 && c.attachCommitmentId ? (
                      <Link href={`/planejamento/compromissos/${c.attachCommitmentId}/anexar-nf`} className="btn">
                        Anexar nota
                      </Link>
                    ) : null}
                  </div>
                </div>
                {c.uses.length > 0 ? (
                  <ul className="space-y-1 rounded-lg bg-[var(--gray-50)] px-3 py-2 text-sm">
                    {c.uses.map((u) => (
                      <li key={u.proofId} className="flex flex-wrap items-center justify-between gap-2">
                        {u.commitmentId ? (
                          <Link href={`/planejamento/compromissos/${u.commitmentId}`} className="hover:underline">
                            {u.nfLabel}
                          </Link>
                        ) : (
                          <span>{u.nfLabel}</span>
                        )}
                        <strong className="tabular-nums">{formatCurrency(u.amount)}</strong>
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
