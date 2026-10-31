import Link from "next/link";
import { getPanoramaInsights } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatCurrency, formatCgccpf } from "@/lib/format";
import { getWorkspaceContext } from "@/lib/auth/session";
import { FieldLabel } from "@/components/FieldHelp";
import { PageHeader, Section, StatCard } from "@/components/ui";
import { HELP } from "@/lib/help";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pct(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export default async function PanoramaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const accountId = typeof sp.accountId === "string" ? sp.accountId : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const rulesetVersion =
    typeof sp.rulesetVersion === "string" ? sp.rulesetVersion : undefined;

  const [accounts, rulesetOptions, insights] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { workspaceId: entitlements.workspaceId },
      orderBy: { name: "asc" },
    }),
    prisma.complianceRuleset.findMany({
      where: {
        deletedAt: null,
        projects: { some: { salicAccount: { workspaceId: entitlements.workspaceId } } },
      },
      select: { version: true, sourceCode: true },
      orderBy: { effectiveFrom: "desc" },
    }),
    getPanoramaInsights({
      accountId,
      from,
      to,
      rulesetVersion,
      workspaceId: entitlements.workspaceId,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panorama geral"
        description="Uma visão de todos os pagamentos de uma vez: para onde foi o dinheiro e quem mais recebeu. Para ver os limites de cada projeto, use Por PRONAC."
      />

      <form className="card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="field">
            <FieldLabel htmlFor="accountId" help={HELP.filterProponente}>
              Proponente
            </FieldLabel>
            <select id="accountId" name="accountId" defaultValue={accountId || ""}>
              <option value="">Todos os proponentes</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <FieldLabel htmlFor="rulesetVersion" help={HELP.filterRuleset}>
              Regra (IN)
            </FieldLabel>
            <select id="rulesetVersion" name="rulesetVersion" defaultValue={rulesetVersion || ""}>
              <option value="">Todas as INs</option>
              {rulesetOptions.map((r) => (
                <option key={r.version} value={r.version}>
                  {r.sourceCode}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn">
              Aplicar
            </button>
            {accountId || rulesetVersion || from || to ? (
              <Link href="/panorama" className="btn btn-ghost">
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
        <details className="more-filters" open={Boolean(from || to) || undefined}>
          <summary>Filtrar por período</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2 md:max-w-xl">
            <div className="field">
              <FieldLabel htmlFor="from">Pagamentos a partir de</FieldLabel>
              <input id="from" name="from" type="date" defaultValue={from || ""} />
            </div>
            <div className="field">
              <FieldLabel htmlFor="to">Pagamentos até</FieldLabel>
              <input id="to" name="to" type="date" defaultValue={to || ""} />
            </div>
          </div>
        </details>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total pago" value={formatCurrency(insights.total)} />
        <StatCard
          label="Fornecedores"
          value={String(insights.supplierCount)}
          hint={`Média ${formatCurrency(insights.avgPerSupplier)} por fornecedor`}
        />
        <StatCard
          label="Projetos"
          value={String(insights.projectCount)}
          hint={`${insights.paymentCount} pagamentos`}
        />
        <StatCard
          label="Proponentes"
          value={String(insights.accountCount)}
          hint={
            insights.watched.count > 0
              ? `${insights.watched.count} observados · ${pct(insights.watched.sharePct)} do total`
              : "Nenhum observado cadastrado"
          }
        />
      </section>

      <Section
        step={1}
        tone="highlight"
        title="O que chama atenção"
        description="Resumo automático dos pagamentos, de acordo com os filtros acima."
      >
        <ul className="list-disc space-y-2 pl-5 text-[0.95rem] text-[var(--gray-600)]">
          {insights.highlights.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </Section>

      <Section
        step={2}
        title="Quem mais recebeu"
        description="Os fornecedores com mais dinheiro recebido e quanto isso representa do total pago."
        actions={
          <Link href="/fornecedores-pagos" className="btn btn-ghost">
            Ver todos os fornecedores
          </Link>
        }
      >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">

          {insights.topSuppliers.length === 0 ? (
            <p className="text-sm text-[var(--gray-500)]">Sem dados para exibir.</p>
          ) : (
            <ul className="space-y-4">
              {insights.topSuppliers.map((s) => (
                <li key={s.supplierId}>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/panorama/${s.supplierId}`}
                        className="font-semibold text-[var(--navy)] underline-offset-2 hover:underline"
                      >
                        {s.name}
                      </Link>
                      <p className="text-sm text-[var(--gray-500)]">
                        {formatCgccpf(s.cgccpf)} · {s.projectCount} projeto
                        {s.projectCount === 1 ? "" : "s"} · {s.count} pag.
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <strong className="text-[var(--navy)]">{formatCurrency(s.total)}</strong>
                      <span className="ml-2 text-[var(--gray-500)]">{pct(s.sharePct)}</span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-100)]">
                    <div
                      className="h-full rounded-full accent-bar"
                      style={{ width: `${Math.min(100, s.sharePct)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-4">
          <h3 className="text-base font-semibold text-[var(--navy)]">Concentração</h3>
          <p className="mt-1 text-[0.95rem] text-[var(--gray-600)]">
            Quanto os maiores recebem do total.
          </p>
          <dl className="mt-5 space-y-4">
            {[
              { label: "1º colocado", value: insights.concentration.top1Pct },
              { label: "3 maiores", value: insights.concentration.top3Pct },
              { label: "5 maiores", value: insights.concentration.top5Pct },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <dt className="text-[var(--gray-500)]">{item.label}</dt>
                  <dd className="font-semibold text-[var(--navy)]">{pct(item.value)}</dd>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-100)]">
                  <div
                    className="h-full rounded-full bg-[var(--navy)]"
                    style={{ width: `${Math.min(100, item.value)}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>
          {insights.watched.count > 0 && (
            <div className="mt-6 border-t border-[var(--border)] pt-4 text-[0.95rem]">
              <p className="font-semibold text-[var(--navy)]">Observados</p>
              <p className="mt-1 text-[var(--gray-500)]">
                {formatCurrency(insights.watched.total)} · {pct(insights.watched.sharePct)} do
                total
              </p>
              <Link
                href="/observados?tab=observados"
                className="mt-2 inline-block font-semibold text-[var(--navy)] underline-offset-2 hover:underline"
              >
                Gerenciar lista
              </Link>
            </div>
          )}
        </div>
      </div>
      </Section>

      <Section
        step={3}
        title="Projetos com mais pagamentos"
        description="Os PRONACs que mais concentraram dinheiro. Clique no número para abrir a análise do projeto."
      >

        {insights.topPronacs.length === 0 ? (
          <p className="text-sm text-[var(--gray-500)]">Sem projetos no filtro.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>PRONAC</th>
                  <th>Projeto</th>
                  <th>Total</th>
                  <th>% do filtro</th>
                  <th>Fornecedores</th>
                  <th aria-label="Participação" />
                </tr>
              </thead>
              <tbody>
                {insights.topPronacs.map((p) => (
                  <tr key={p.pronac}>
                    <td>
                      <Link
                        href={`/panorama/pronac/${p.pronac}`}
                        className="font-semibold text-[var(--navy)] underline-offset-2 hover:underline"
                      >
                        {p.pronac}
                      </Link>
                    </td>
                    <td>{p.name || "—"}</td>
                    <td className="font-medium text-[var(--navy)]">
                      {formatCurrency(p.total)}
                    </td>
                    <td>{pct(p.sharePct)}</td>
                    <td>{p.supplierCount}</td>
                    <td className="min-w-[120px]">
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--gray-100)]">
                        <div
                          className="h-full rounded-full accent-bar"
                          style={{
                            width: `${Math.min(100, p.sharePct)}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        collapsible
        step={4}
        title="PRONACs por regra (IN)"
        description="Quantos projetos seguem cada instrução normativa. Clique numa IN para filtrar o panorama por ela."
      >
        {insights.rulesets.length === 0 ? (
          <p className="text-sm text-[var(--gray-500)]">Nenhum PRONAC no filtro.</p>
        ) : (
          <ul className="space-y-3">
            {insights.rulesets.map((r) => {
              const qs = new URLSearchParams();
              if (accountId) qs.set("accountId", accountId);
              if (from) qs.set("from", from);
              if (to) qs.set("to", to);
              if (r.version) qs.set("rulesetVersion", r.version);
              const href = `/panorama?${qs.toString()}`;
              const active = Boolean(r.version && r.version === rulesetVersion);
              return (
                <li key={r.version || r.sourceCode}>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    {r.version ? (
                      <Link
                        href={href}
                        className={`font-medium underline-offset-2 hover:underline ${
                          active ? "text-[var(--gold-ink,var(--navy))]" : "text-[var(--navy)]"
                        }`}
                      >
                        {r.sourceCode}
                        {active ? " · filtro ativo" : ""}
                      </Link>
                    ) : (
                      <span className="font-medium text-[var(--navy)]">{r.sourceCode}</span>
                    )}
                    <span className="text-sm text-[var(--gray-500)]">
                      <strong className="text-[var(--navy)]">{r.count}</strong> PRONAC
                      {r.count === 1 ? "" : "s"} · {pct(r.sharePct)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-100)]">
                    <div
                      className={`h-full rounded-full ${active ? "accent-bar" : "bg-[var(--navy)]"}`}
                      style={{ width: `${Math.min(100, r.sharePct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
