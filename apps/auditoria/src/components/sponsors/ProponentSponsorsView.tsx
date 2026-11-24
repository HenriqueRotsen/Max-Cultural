import Link from "next/link";
import { StatCard } from "@/components/ui";
import { formatCgccpf, formatCurrency, formatDate } from "@/lib/format";
import type { ProponentAnalysis } from "@/lib/sponsors-by-proponent";

const pctText = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const period = (a: Date | null, b: Date | null) =>
  !a && !b
    ? "—"
    : a && b && formatDate(a) !== formatDate(b)
      ? `${formatDate(a)} a ${formatDate(b)}`
      : formatDate(a ?? b);

function hrefFor(params: { proponente?: string; q?: string }) {
  const sp = new URLSearchParams({ aba: "proponente" });
  if (params.proponente) sp.set("proponente", params.proponente);
  if (params.q) sp.set("q", params.q);
  return `/patrocinadores?${sp.toString()}`;
}

/** Aba "Por proponente": lista de proponentes ou a análise de um deles. */
export function ProponentSponsorsView({
  proponents,
  selectedId,
  q,
}: {
  proponents: ProponentAnalysis[];
  selectedId: string | null;
  q: string;
}) {
  const selected = selectedId ? proponents.find((p) => p.id === selectedId) : undefined;
  if (selected) return <ProponentDetail p={selected} q={q} />;
  return <ProponentList proponents={proponents} q={q} />;
}

function ProponentList({ proponents, q }: { proponents: ProponentAnalysis[]; q: string }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
        <form action="/patrocinadores" className="flex max-w-xl gap-2">
          <input type="hidden" name="aba" value="proponente" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Proponente, CNPJ ou patrocinador"
            className="flex-1"
            aria-label="Buscar proponente"
          />
          <button type="submit" className="btn">
            Buscar
          </button>
        </form>
        <p className="mt-2 text-sm text-[var(--gray-600)]">
          Clique num proponente para ver quem patrocina os projetos dele, quanto e em quais PRONACs.
        </p>
      </div>
      {proponents.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--gray-500)]">
          {q ? `Nenhum proponente encontrado para “${q}”.` : "Nenhum proponente com projetos ainda."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Proponente</th>
                <th className="num">Projetos</th>
                <th className="num">Patrocinadores</th>
                <th className="num">Aportes</th>
                <th className="num">Total aportado</th>
                <th className="num">Maior patrocinador</th>
              </tr>
            </thead>
            <tbody>
              {proponents.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      href={hrefFor({ proponente: p.id })}
                      className="font-semibold text-[var(--navy)] hover:underline"
                    >
                      {p.name}
                    </Link>
                    <p className="text-xs text-[var(--gray-500)]">{formatCgccpf(p.cgccpf)}</p>
                  </td>
                  <td className="num">
                    {p.projectsWithSponsors}
                    <span className="text-[var(--gray-500)]"> / {p.projectsTotal}</span>
                  </td>
                  <td className="num">
                    {p.sponsorsCount}
                    {p.conflicts > 0 ? (
                      <span
                        className="badge badge-warn ml-1"
                        title="Patrocinaram e receberam pagamento do mesmo projeto"
                      >
                        {p.conflicts} também receberam
                      </span>
                    ) : null}
                  </td>
                  <td className="num">{p.aportes}</td>
                  <td className="num font-semibold">{formatCurrency(p.total)}</td>
                  <td className="num">{p.sponsorsCount ? pctText(p.topShare) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProponentDetail({ p, q }: { p: ProponentAnalysis; q: string }) {
  const terms = q.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").split(/\s+/).filter(Boolean);
  const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const sponsors = terms.length
    ? p.sponsors.filter((s) => {
        const hay = plain(`${s.name} ${s.cgccpf} ${s.projects.map((x) => `${x.pronac} ${x.name || ""}`).join(" ")}`);
        return terms.every((t) => hay.includes(t));
      })
    : p.sponsors;
  const semPatrocinador = p.projects.filter((x) => x.aportes === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={hrefFor({})} className="text-sm text-[var(--gray-600)] hover:underline">
            ← Todos os proponentes
          </Link>
          <h2 className="mt-1 text-xl font-semibold text-[var(--navy)]">{p.name}</h2>
          <p className="text-sm text-[var(--gray-500)]">
            {formatCgccpf(p.cgccpf)} · aportes de {period(p.firstAt, p.lastAt)}
          </p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Patrocinadores"
          value={String(p.sponsorsCount)}
          hint={
            p.recurrentSponsors
              ? `${plural(p.recurrentSponsors, "aportou", "aportaram")} em mais de um projeto`
              : "Nenhum aportou em mais de um projeto"
          }
        />
        <StatCard
          label="Aportes"
          value={String(p.aportes)}
          hint={
            p.sponsorsCount
              ? `Média de ${(p.aportes / p.sponsorsCount).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por patrocinador`
              : undefined
          }
        />
        <StatCard
          label="Projetos com aporte"
          value={`${p.projectsWithSponsors} de ${p.projectsTotal}`}
          hint={
            semPatrocinador
              ? `${plural(semPatrocinador, "projeto", "projetos")} sem patrocinador identificado`
              : "Todos com patrocinador"
          }
        />
        <StatCard
          label="Total aportado"
          value={formatCurrency(p.total)}
          hint={
            p.captado > 0
              ? `${pctText((p.total / p.captado) * 100)} do captado (${formatCurrency(p.captado)})`
              : undefined
          }
        />
      </section>

      {p.sponsorsCount > 0 ? (
        <section className="card px-5 py-4 text-sm text-[var(--gray-700)]">
          <p>
            <strong className="text-[var(--navy)]">Concentração:</strong> o maior patrocinador,{" "}
            <strong>{p.sponsors[0]!.name}</strong>, responde por <strong>{pctText(p.topShare)}</strong> do que foi
            aportado
            {p.sponsorsCount > 3 ? (
              <>
                ; os 3 maiores, por <strong>{pctText(p.top3Share)}</strong>
              </>
            ) : null}
            .
          </p>
          {p.conflicts > 0 ? (
            <p className="mt-1 text-[var(--warn-700,#92400e)]">
              {plural(p.conflicts, "patrocinador também recebeu", "patrocinadores também receberam")} pagamento de
              projeto deste proponente.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h3 className="font-semibold text-[var(--navy)]">Patrocinadores do proponente</h3>
          <form action="/patrocinadores" className="flex min-w-0 max-w-md flex-1 gap-2">
            <input type="hidden" name="aba" value="proponente" />
            <input type="hidden" name="proponente" value={p.id} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Patrocinador, CNPJ ou PRONAC"
              className="min-w-0 flex-1"
              aria-label="Filtrar patrocinadores"
            />
            <button type="submit" className="btn">
              Filtrar
            </button>
          </form>
        </div>
        {sponsors.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[var(--gray-500)]">
            {q
              ? `Nenhum patrocinador encontrado para “${q}”.`
              : "Nenhum patrocinador identificado nos projetos deste proponente."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Patrocinador</th>
                  <th className="num">Projetos</th>
                  <th className="num">Aportes</th>
                  <th className="num">Total</th>
                  <th className="num">% do proponente</th>
                  <th>Período</th>
                </tr>
              </thead>
              <tbody>
                {sponsors.map((s) => (
                  <tr key={s.key} className="align-top">
                    <td className="min-w-[16rem]">
                      <p className="font-medium text-[var(--navy)]">
                        {s.name}
                        {s.conflict ? (
                          <span className="badge badge-warn ml-2 align-middle">Também recebeu pagamento</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-[var(--gray-500)]">{formatCgccpf(s.cgccpf)}</p>
                      <details className="group mt-1">
                        <summary className="cursor-pointer text-xs font-medium text-[var(--navy)] hover:underline">
                          <span className="group-open:hidden">
                            Ver {s.projects.length === 1 ? "o PRONAC" : `os ${s.projects.length} PRONACs`}
                          </span>
                          <span className="hidden group-open:inline">Recolher</span>
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-[var(--gray-600)]">
                          {s.projects.map((x) => (
                            <li key={x.pronac}>
                              <Link
                                href={`/panorama/pronac/${x.pronac}?tab=patrocinadores`}
                                className="hover:underline"
                              >
                                PRONAC {x.pronac}
                              </Link>
                              {x.name ? ` · ${x.name}` : ""} · {formatCurrency(x.total)} ·{" "}
                              {plural(x.aportes, "aporte", "aportes")}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td className="num">{s.projects.length}</td>
                    <td className="num">{s.aportes}</td>
                    <td className="num font-semibold">{formatCurrency(s.total)}</td>
                    <td className="num">{pctText(s.share)}</td>
                    <td className="whitespace-nowrap text-sm text-[var(--gray-600)]">{period(s.firstAt, s.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
              {!q ? (
                <tfoot>
                  <tr>
                    <td className="font-semibold">Total</td>
                    <td className="num">{p.projectsWithSponsors}</td>
                    <td className="num">{p.aportes}</td>
                    <td className="num font-semibold">{formatCurrency(p.total)}</td>
                    <td className="num">100%</td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h3 className="font-semibold text-[var(--navy)]">Projetos do proponente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Projeto</th>
                <th className="num">Patrocinadores</th>
                <th className="num">Aportes</th>
                <th className="num">Aportado</th>
                <th className="num">Captado</th>
                <th>Maior patrocinador</th>
              </tr>
            </thead>
            <tbody>
              {p.projects.map((x) => (
                <tr key={x.id}>
                  <td className="min-w-[14rem]">
                    <Link
                      href={`/panorama/pronac/${x.pronac}?tab=patrocinadores`}
                      className="font-medium text-[var(--navy)] hover:underline"
                    >
                      PRONAC {x.pronac}
                    </Link>
                    {x.name ? <p className="text-xs text-[var(--gray-500)]">{x.name}</p> : null}
                  </td>
                  <td className="num">{x.sponsors || "—"}</td>
                  <td className="num">{x.aportes || "—"}</td>
                  <td className="num">{x.aportes ? formatCurrency(x.total) : "—"}</td>
                  <td className="num">{x.captado != null ? formatCurrency(x.captado) : "—"}</td>
                  <td className="text-sm text-[var(--gray-600)]">
                    {x.topSponsor ? `${x.topSponsor.name} (${pctText(x.topSponsor.share)})` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
