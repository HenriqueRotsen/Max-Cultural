import Link from "next/link";
import { StatCard } from "@/components/ui";
import { formatCgccpf, formatCurrency, formatDate } from "@/lib/format";
import type { SponsorGroup, SponsorOption } from "@/lib/sponsor-group";
import { SponsorGroupPicker } from "@/components/sponsors/SponsorGroupPicker";

const pctText = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const period = (a: Date | null, b: Date | null) =>
  !a && !b ? "—" : a && b && formatDate(a) !== formatDate(b) ? `${formatDate(a)} a ${formatDate(b)}` : formatDate(a ?? b);

/** Aba "Grupo empresarial": escolha temporária de patrocinadores vistos como um só. */
export function SponsorGroupView({
  options,
  selected,
  group,
}: {
  options: SponsorOption[];
  selected: string[];
  group: SponsorGroup | null;
}) {
  const picker = <SponsorGroupPicker options={options} selected={selected} suggestions={group?.suggestions ?? []} />;

  if (!group || !group.members.length) {
    return (
      <section className="card space-y-3 p-5">
        <div>
          <h2 className="font-semibold text-[var(--navy)]">Montar um grupo empresarial</h2>
          <p className="mt-0.5 text-sm text-[var(--gray-600)]">
            Escolha os patrocinadores do mesmo grupo (por exemplo, a Vale e as empresas dela) para ver tudo somado:
            aportes, PRONACs, valor total e proponentes. O grupo não é salvo — fica só no endereço desta página, que pode
            ser copiado e enviado.
          </p>
        </div>
        {picker}
      </section>
    );
  }

  const g = group;
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <details className="group">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-semibold text-[var(--navy)]">Grupo com {plural(g.members.length, "patrocinador", "patrocinadores")}</span>
              <span className="ml-2 text-sm text-[var(--gray-500)]">{g.members.map((m) => m.name).join(" · ")}</span>
            </span>
            <span className="text-sm font-medium text-[var(--navy)] hover:underline">
              <span className="group-open:hidden">Mudar o grupo</span>
              <span className="hidden group-open:inline">Fechar</span>
            </span>
          </summary>
          <div className="mt-4">{picker}</div>
        </details>
        {!g.suggestions.length ? null : (
          <p className="mt-2 text-xs text-[var(--gray-600)]">
            {plural(g.suggestions.length, "patrocinador fora do grupo tem", "patrocinadores fora do grupo têm")} a mesma raiz de
            CNPJ de alguém do grupo. Abra &ldquo;Mudar o grupo&rdquo; para incluir.
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total aportado" value={formatCurrency(g.total)} hint={`Aportes de ${period(g.firstAt, g.lastAt)}`} />
        <StatCard
          label="Aportes"
          value={String(g.aportes)}
          hint={`Média de ${formatCurrency(g.aportes ? g.total / g.aportes : 0)} por aporte`}
        />
        <StatCard label="PRONACs" value={String(g.pronacs.length)} hint={plural(g.proponents.length, "proponente", "proponentes")} />
        <StatCard
          label="Também receberam"
          value={String(g.conflicts)}
          hint={g.conflicts ? "Patrocinaram e receberam pagamento do mesmo projeto" : "Nenhum recebeu pagamento"}
        />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h3 className="font-semibold text-[var(--navy)]">Empresas do grupo</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Patrocinador</th>
                <th className="num">PRONACs</th>
                <th className="num">Aportes</th>
                <th className="num">Total</th>
                <th className="num">% do grupo</th>
                <th>Período</th>
              </tr>
            </thead>
            <tbody>
              {g.members.map((m) => (
                <tr key={m.key}>
                  <td>
                    <p className="font-medium text-[var(--navy)]">
                      {m.name}
                      {m.conflict ? <span className="badge badge-warn ml-2 align-middle">Também recebeu pagamento</span> : null}
                    </p>
                    <p className="text-xs text-[var(--gray-500)]">{formatCgccpf(m.cgccpf)}</p>
                  </td>
                  <td className="num">{m.pronacs}</td>
                  <td className="num">{m.aportes}</td>
                  <td className="num font-semibold">{formatCurrency(m.total)}</td>
                  <td className="num">{pctText(m.share)}</td>
                  <td className="whitespace-nowrap text-sm text-[var(--gray-600)]">{period(m.firstAt, m.lastAt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="font-semibold">Grupo</td>
                <td className="num">{g.pronacs.length}</td>
                <td className="num">{g.aportes}</td>
                <td className="num font-semibold">{formatCurrency(g.total)}</td>
                <td className="num">100%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h3 className="font-semibold text-[var(--navy)]">PRONACs patrocinados pelo grupo</h3>
          <p className="mt-0.5 text-sm text-[var(--gray-600)]">Cada PRONAC aparece uma vez, somando todas as empresas do grupo.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Proponente</th>
                <th className="num">Aportes</th>
                <th className="num">Total</th>
                <th>Empresas do grupo</th>
              </tr>
            </thead>
            <tbody>
              {g.pronacs.map((p) => (
                <tr key={p.pronac} className="align-top">
                  <td className="min-w-[12rem]">
                    <Link href={`/panorama/pronac/${p.pronac}?tab=patrocinadores`} className="font-medium text-[var(--navy)] hover:underline">
                      PRONAC {p.pronac}
                    </Link>
                    {p.name ? <p className="text-xs text-[var(--gray-500)]">{p.name}</p> : null}
                  </td>
                  <td className="text-sm">{p.accountName}</td>
                  <td className="num">{p.aportes}</td>
                  <td className="num font-semibold">{formatCurrency(p.total)}</td>
                  <td className="text-sm text-[var(--gray-600)]">
                    {p.members.map((m) => `${m.name} (${formatCurrency(m.total)})`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
          <h3 className="font-semibold text-[var(--navy)]">Por proponente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Proponente</th>
                <th className="num">PRONACs</th>
                <th className="num">Aportes</th>
                <th className="num">Total</th>
                <th className="num">% do grupo</th>
              </tr>
            </thead>
            <tbody>
              {g.proponents.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/patrocinadores?aba=proponente&proponente=${a.id}`} className="font-medium text-[var(--navy)] hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="num">{a.pronacs}</td>
                  <td className="num">{a.aportes}</td>
                  <td className="num font-semibold">{formatCurrency(a.total)}</td>
                  <td className="num">{pctText(a.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
