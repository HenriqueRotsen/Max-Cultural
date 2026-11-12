import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ProponentCorporateMapEditor } from "@/components/ProponentCorporateMapEditor";
import { getWorkspaceContext } from "@/lib/auth/session";
import { loadObservadoMap } from "@/lib/corporate/observado-map";
import { formatPrecisionDate } from "@/lib/corporate/dates";
import { formatCgccpf, formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const fmtPeriod = (from: Date, to: Date | null) =>
  `${formatDate(from)} a ${to ? formatDate(to) : "hoje"}`;

function Amount({ total, count }: { total: number; count: number }) {
  return (
    <>
      <span className="whitespace-nowrap font-medium">{formatCurrency(total)}</span>
      <span className="block text-xs text-[var(--gray-500)]">
        {count} pagamento{count === 1 ? "" : "s"}
      </span>
    </>
  );
}

export default async function ObservadoMapaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const data = await loadObservadoMap(id, entitlements.workspaceId);
  if (!data) notFound();
  const { watched, isCompany } = data;
  // Sócios que também são observados (mesmo aviso do mapa do proponente).
  const matched = data.crossRefs.filter((p) => p.watchedId && p.watchedId !== watched.id);
  const matchedDocs = matched.map((p) => p.cgccpf);
  const matchedNames = matched.map((p) => p.name);
  const proponent = data.proponent;
  // Observado que também é proponente: o mapa é o do proponente (um só por CNPJ).
  const editor = isCompany ? (
    <ProponentCorporateMapEditor
      accountId={proponent ? proponent.id : watched.id}
      ownerField={proponent ? "accountId" : "watchedId"}
      accountName={proponent ? proponent.name : data.name}
      accountCgccpf={data.doc}
      foundedAt={(proponent ? proponent.foundedAt : watched.foundedAt)?.toISOString() || null}
      foundedAtPrecision={proponent ? proponent.foundedAtPrecision : "DAY"}
      institutionalMap={proponent?.institutionalMap ?? false}
      matchedSupplierDocs={new Set(matchedDocs)}
      periods={data.corporatePeriods.map((p) => ({
        id: p.id,
        label: p.label,
        source: p.source,
        validFrom: p.validFrom.toISOString(),
        validFromPrecision: p.validFromPrecision,
        validTo: p.validTo?.toISOString() || null,
        validToPrecision: p.validToPrecision,
        members: p.members.map((m) => ({
          id: m.id,
          name: m.name,
          cgccpf: m.cgccpf,
          personType: m.personType,
          role: m.role,
          source: m.source,
        })),
      }))}
    />
  ) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/contas/mapa"
          className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]"
        >
          ← Voltar ao mapa societário
        </Link>
      </div>

      <PageHeader
        breadcrumb="Início › Observados › Mapa societário"
        title={`${isCompany ? "Mapa societário" : "Empresas e recebimentos"} · ${data.name}`}
        description={`${isCompany ? "CNPJ" : "CPF"} ${formatCgccpf(data.doc)} · observado`}
      />

      {proponent ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm text-[var(--navy)]">
          Este CNPJ também é <strong>proponente</strong>. O mapa societário é um só: o mesmo de{" "}
          <Link href={`/contas/mapa/${proponent.id}`} className="font-semibold underline">
            Mapa societário › {proponent.name}
          </Link>
          . O que mudar aqui muda lá.
          {data.unify.moved > 0
            ? ` ${data.unify.moved === 1 ? "O intervalo que estava" : `Os ${data.unify.moved} intervalos que estavam`} só no observado ${data.unify.moved === 1 ? "passou" : "passaram"} para esse mapa.`
            : ""}
        </div>
      ) : null}
      {data.unify.leftover > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Este observado tinha {data.unify.leftover} intervalo(s) próprio(s) antes de virar
          proponente. Como o mapa do proponente já tinha intervalos, eles não foram juntados e não
          são usados. Confira o mapa do proponente.
        </div>
      ) : null}

      {matchedNames.length > 0 ? (
        <div className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]">
          <strong>{matchedNames.length}</strong> sócio{matchedNames.length === 1 ? "" : "s"} do
          mapa {matchedNames.length === 1 ? "consta" : "constam"} como observado
          {matchedNames.length === 1 ? "" : "s"}: {matchedNames.join(", ")}.
        </div>
      ) : null}

      {editor}

      {/* Recebimentos */}
      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--navy)]">Recebimentos nos PRONACs</h2>
          <p className="mt-1 text-sm text-[var(--gray-600)]">
            {data.paymentCount === 0
              ? "Nenhum pagamento encontrado nos PRONACs acompanhados."
              : `${formatCurrency(data.total)} em ${data.paymentCount} pagamento${data.paymentCount === 1 ? "" : "s"}, em ${data.projects.length} PRONAC${data.projects.length === 1 ? "" : "s"}.`}
          </p>
        </div>

        {isCompany && data.paymentCount > 0 ? (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Quem era sócio</th>
                  <th>Período</th>
                  <th className="text-right">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {data.periods.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.members.length
                        ? p.members.map((m) => m.name).join(", ")
                        : "Ninguém cadastrado"}
                    </td>
                    <td className="whitespace-nowrap">
                      {formatPrecisionDate(p.validFrom.toISOString(), p.validFromPrecision)} a{" "}
                      {p.validTo
                        ? formatPrecisionDate(p.validTo.toISOString(), p.validToPrecision)
                        : "hoje"}
                    </td>
                    <td className="text-right tabular-nums">
                      <Amount total={p.paid.total} count={p.paid.count} />
                    </td>
                  </tr>
                ))}
                {data.outside.count > 0 ? (
                  <tr>
                    <td className="text-[#8a4b12]">
                      {data.periods.length === 0
                        ? "Mapa ainda não cadastrado"
                        : "Fora dos intervalos cadastrados (ou sem data)"}
                    </td>
                    <td />
                    <td className="text-right tabular-nums">
                      <Amount total={data.outside.total} count={data.outside.count} />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {data.projects.length > 0 ? (
          <div className="overflow-x-auto border-t border-[var(--border)]">
            <table className="data">
              <thead>
                <tr>
                  <th>PRONAC</th>
                  <th>Proponente</th>
                  <th>Pagamentos entre</th>
                  <th className="text-right">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.pronac}>
                    <td>
                      <span className="font-medium">{p.pronac}</span>
                      {p.name ? (
                        <span className="block text-xs text-[var(--gray-500)]">{p.name}</span>
                      ) : null}
                    </td>
                    <td>{p.proponent}</td>
                    <td className="whitespace-nowrap">
                      {p.first ? `${formatDate(p.first)} a ${formatDate(p.last)}` : "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      <Amount total={p.total} count={p.count} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Ligações */}
      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--navy)]">
            {isCompany ? "Os sócios em outras empresas" : "Empresas em que é sócio"}
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-600)]">
            Cruza com os mapas societários já cadastrados (proponentes e observados).
            {isCompany ? " Sócio sem CPF completo não entra no cruzamento." : ""}
          </p>
        </div>
        {data.crossRefs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--gray-500)]">
            {isCompany
              ? "Cadastre os sócios abaixo (ou busque na Receita) para ver as ligações."
              : "Sem CPF para cruzar."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {data.crossRefs.map((p) => (
              <li key={p.cgccpf} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-semibold text-[var(--navy)]">{p.name}</span>
                  <span className="text-sm text-[var(--gray-500)]">{formatCgccpf(p.cgccpf)}</span>
                  {p.watchedId && p.watchedId !== watched.id ? (
                    <Link
                      href={`/observados/${p.watchedId}/mapa`}
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                    >
                      Observado
                    </Link>
                  ) : null}
                  {p.proponent ? (
                    <Link
                      href={`/contas/mapa/${p.proponent.id}`}
                      className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800"
                    >
                      É proponente
                    </Link>
                  ) : null}
                </div>
                {p.received > 0 && p.cgccpf !== data.doc ? (
                  <p className="text-sm text-[var(--gray-600)]">
                    Recebeu direto {formatCurrency(p.received)} nos PRONACs acompanhados.
                  </p>
                ) : null}
                {p.companies.length === 0 ? (
                  <p className="text-sm text-[var(--gray-500)]">
                    Não aparece em outro mapa societário cadastrado.
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {p.companies.map((c) => (
                      <li key={c.key} className="flex flex-wrap items-baseline gap-x-2">
                        {c.href ? (
                          <Link href={c.href} className="font-medium text-[var(--navy)] hover:underline">
                            {c.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{c.name}</span>
                        )}
                        <span className="text-xs text-[var(--gray-500)]">
                          {c.kind === "proponente" ? "proponente" : "observado"} ·{" "}
                          {fmtPeriod(c.from, c.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
