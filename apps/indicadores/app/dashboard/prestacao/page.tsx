import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { ListPager } from "@/components/admin/list-pager";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { listPrestacaoProjetosAction } from "@/app/actions/prestacao";
import { PrestacaoFiltros } from "@/components/prestacao/prestacao-filtros";
import { BarraEquipe } from "@/components/prestacao/progresso";
import { LEI_LABEL } from "@/lib/prestacao/types";
import { EQUIPES } from "@/lib/prestacao/regras";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function fmtDia(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function PrestacaoPage({ searchParams }: Props) {
  await requireDashboardPermission("prestacao:read");
  const sp = await searchParams;
  const filtros = { q: um(sp.q), contexto: um(sp.contexto), lei: um(sp.lei), entregue: um(sp.entregue) };
  const lista = await listPrestacaoProjetosAction({
    q: filtros.q,
    contextoId: filtros.contexto,
    lei: filtros.lei,
    entregue: filtros.entregue === "sim" || filtros.entregue === "nao" ? filtros.entregue : undefined,
    page: Number(um(sp.page)) || 1,
  });
  const filtrando = Object.values(filtros).some(Boolean);

  return (
    <AdminShell title="Prestação de contas">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">Prestação de contas</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Uma ficha por execução de cada ação. Produção, Comunicação e Gestão preenchem cada uma a sua parte;
            dados do projeto, da agenda e das inscrições já vêm do sistema.
          </p>
        </div>
        <Link
          href="/dashboard/prestacao/modelo"
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-brand-deep hover:bg-muted/40"
        >
          Configurações · modelo da ficha
        </Link>
      </div>

      <div className="mb-4">
        <PrestacaoFiltros contextos={lista.contextos} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-brand-mist/50 text-left text-xs text-brand-deep">
            <tr>
              <th className="px-4 py-2 font-semibold">Projeto</th>
              <th className="px-4 py-2 font-semibold">Lei e patrocinador</th>
              <th className="px-4 py-2 font-semibold">Execuções</th>
              <th className="px-4 py-2 font-semibold">Preenchimento</th>
              <th className="px-4 py-2 font-semibold">Entrega</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {lista.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {filtrando ? "Nenhum projeto com estes filtros." : "Nenhum projeto no seu acesso."}
                </td>
              </tr>
            ) : (
              lista.items.map((p) => (
                <tr key={p.id} className="align-top hover:bg-muted/30">
                  <td className="min-w-[13rem] px-4 py-3">
                    <Link
                      href={`/dashboard/prestacao/${encodeURIComponent(p.id)}`}
                      className="font-medium text-brand-deep underline-offset-2 hover:underline"
                    >
                      {p.nome}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.contextoNome}
                      {p.identificacao ? ` · ${p.identificacao}` : p.pronac ? ` · PRONAC ${p.pronac}` : ""}
                    </div>
                  </td>
                  <td className="min-w-[9rem] px-4 py-3 text-xs">
                    <div>{p.lei ? LEI_LABEL[p.lei] : <span className="text-muted-foreground">Lei não informada</span>}</div>
                    <div className="text-muted-foreground">{p.patrocinador || "Sem patrocinador informado"}</div>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {p.execucoes ? p.execucoes : <span className="text-muted-foreground">Sem agenda</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.execucoes ? (
                      <div className="grid min-w-48 gap-1">
                        {EQUIPES.map((e) => (
                          <BarraEquipe key={e} equipe={e} pct={p.progresso[e]} compacta />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {p.entregueEm ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                        Entregue em {fmtDia(p.entregueEm)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Em preparação</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <ListPager
          page={lista.page}
          pageCount={lista.pageCount}
          total={lista.total}
          pageSize={lista.pageSize}
          params={{ ...filtros, page: String(lista.page) }}
        />
      </div>
    </AdminShell>
  );
}
