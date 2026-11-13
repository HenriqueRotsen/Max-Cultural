import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ImportMissingMapsButton } from "@/components/ImportMissingMapsButton";
import { getWorkspaceContext } from "@/lib/auth/session";
import { corporateRoleLabel } from "@/lib/corporate/copy";
import { loadNetwork } from "@/lib/corporate/network-db";
import { formatCgccpf, formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const period = (from: Date, to: Date | null) =>
  to ? `de ${formatDate(from)} a ${formatDate(to)}` : `desde ${formatDate(from)}`;

export default async function RedeObservadosPage() {
  const { entitlements } = await getWorkspaceContext();
  const { groups, receivedByDoc, withoutMap, companiesTotal } = await loadNetwork(
    entitlements.workspaceId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Auditoria › Observados › Rede"
        title="Rede dos observados"
        description="Empresas ligadas por sócios em comum, segundo os mapas societários cadastrados. As datas são de entrada e saída na sociedade, não de pagamento."
      />

      <nav className="accounts-tabs" aria-label="Abas de observados">
        <Link href="/observados?tab=observados">Observados</Link>
        <Link href="/observados/rede" aria-current="page">
          Rede
        </Link>
        <Link href="/observados?tab=adicionar">Adicionar</Link>
      </nav>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-[var(--gray-600)]">
          {companiesTotal} empresa{companiesTotal === 1 ? "" : "s"} (observadas e proponentes)
          {withoutMap.length > 0
            ? `, ${withoutMap.length} ainda sem mapa societário. Sem mapa, a empresa não aparece na rede.`
            : ", todas com mapa societário."}
        </p>
        <ImportMissingMapsButton count={withoutMap.length} />
      </section>

      {groups.length === 0 ? (
        <div className="card p-5 text-sm text-[var(--gray-500)]">
          Nenhuma ligação encontrada nos mapas cadastrados.
        </div>
      ) : null}

      {groups.map((g, i) => {
        const companyByKey = new Map(g.companies.map((c) => [c.key, c]));
        const groupReceived =
          Math.round(
            g.companies.reduce((s, c) => s + (receivedByDoc.get(c.doc) ?? 0), 0) * 100 +
              g.people.reduce((s, p) => s + (receivedByDoc.get(p.doc) ?? 0), 0) * 100,
          ) / 100;
        // Quem liga: pessoas, e empresas que são sócias de outras empresas do grupo.
        const linkers = [
          ...g.people.map((p) => ({ key: p.key, name: p.name, doc: p.doc, watched: p.watched, company: null as null | (typeof g.companies)[number] })),
          ...g.companies
            .filter((c) => g.links.some((l) => l.personKey === c.key))
            .map((c) => ({ key: c.key, name: c.name, doc: c.doc, watched: false, company: c })),
        ];
        return (
          <section key={i} className="card overflow-hidden">
            <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
              <h2 className="text-lg font-semibold text-[var(--navy)]">
                Grupo {i + 1} · {g.companies.length} empresa{g.companies.length === 1 ? "" : "s"}
                {g.people.length ? ` · ${g.people.length} pessoa${g.people.length === 1 ? "" : "s"}` : ""}
              </h2>
              <p className="mt-1 text-sm text-[var(--gray-600)]">
                {groupReceived > 0
                  ? `O grupo recebeu ${formatCurrency(groupReceived)} nos PRONACs acompanhados.`
                  : "Nenhum pagamento do grupo nos PRONACs acompanhados."}
              </p>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--gray-500)]">
                  Empresas
                </h3>
                <ul className="space-y-2 text-sm">
                  {g.companies.map((c) => (
                    <li key={c.key}>
                      <Link href={c.href} className="font-medium text-[var(--navy)] hover:underline">
                        {c.name}
                      </Link>
                      <span className="ml-2 text-xs text-[var(--gray-500)]">
                        {c.kind === "proponente" ? "proponente" : "observado"} · {formatCgccpf(c.doc)}
                        {receivedByDoc.get(c.doc) ? ` · recebeu ${formatCurrency(receivedByDoc.get(c.doc)!)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--gray-500)]">
                  Quem liga as empresas
                </h3>
                <ul className="space-y-3 text-sm">
                  {linkers.map((p) => (
                    <li key={p.key}>
                      <p>
                        <span className="font-medium text-[var(--navy)]">{p.name}</span>
                        {p.doc ? (
                          <span className="ml-2 text-xs text-[var(--gray-500)]">{formatCgccpf(p.doc)}</span>
                        ) : (
                          <span className="ml-2 text-xs text-amber-800">sem CPF completo: ligado pelo nome, confira</span>
                        )}
                        {p.watched ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                            observado
                          </span>
                        ) : null}
                        {!p.company && receivedByDoc.get(p.doc) ? (
                          <span className="ml-2 text-xs text-[var(--gray-500)]">
                            recebeu {formatCurrency(receivedByDoc.get(p.doc)!)}
                          </span>
                        ) : null}
                      </p>
                      <ul className="mt-0.5 text-xs text-[var(--gray-600)]">
                        {g.links
                          .filter((l) => l.personKey === p.key)
                          .map((l, j) => (
                            <li key={j}>
                              {corporateRoleLabel(l.role, false)} de{" "}
                              {companyByKey.get(l.companyKey)?.name ?? "—"} {period(l.from, l.to)}
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
