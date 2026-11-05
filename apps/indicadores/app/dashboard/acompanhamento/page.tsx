import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireDashboardPermission } from "@/lib/dashboard-gate";
import { listAcompanhamentoProjetosAction } from "@/app/actions/acompanhamento";
import { AcompanhamentoFiltros } from "@/components/acompanhamento/acompanhamento-filtros";
import { ListPager } from "@/components/admin/list-pager";
import type { FiltroRecurso, OrdemLista } from "@/lib/acompanhamento/types";

export const dynamic = "force-dynamic";

function Barra({ pct, cor }: { pct: number; cor: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function AcompanhamentoPage({ searchParams }: Props) {
  await requireDashboardPermission("acompanhamento:read");
  const sp = await searchParams;
  const filtros = {
    q: um(sp.q),
    contexto: um(sp.contexto),
    recurso: um(sp.recurso),
    atencao: um(sp.atencao),
    ordem: um(sp.ordem),
  };
  const lista = await listAcompanhamentoProjetosAction({
    q: filtros.q,
    contextoId: filtros.contexto,
    recurso: (["liberado", "aguardando"].includes(filtros.recurso ?? "") ? filtros.recurso : "todos") as FiltroRecurso,
    atencao: filtros.atencao === "1",
    ordem: (filtros.ordem === "atencao" ? "atencao" : "nome") as OrdemLista,
    page: Number(um(sp.page)) || 1,
  });
  const projetos = lista.items;
  const filtrando = Object.values(filtros).some(Boolean);

  return (
    <AdminShell title="Acompanhamento">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">Acompanhamento</h1>
          <p className="text-sm text-muted-foreground">
            Comunicação e Produção de cada projeto: o que está em andamento, atrasado e concluído.
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-red-700">Em atraso</span>: prazo já passou e a tarefa não foi
            concluída. <span className="font-medium text-amber-800">Vencem em até 3 dias</span>: ainda dá tempo.
            Os prazos só contam depois que o recurso é liberado.
          </p>
        </div>
        <Link
          href="/dashboard/acompanhamento/pre-definicao"
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-brand-deep hover:bg-muted/40"
        >
          Configurações · pré-definição
        </Link>
      </div>

      <div className="mb-4">
        <AcompanhamentoFiltros contextos={lista.contextos} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white/90 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-brand-mist/50 text-left text-xs text-brand-deep">
            <tr>
              <th className="px-4 py-2 font-semibold">Projeto</th>
              <th className="px-4 py-2 font-semibold">Comunicação</th>
              <th className="px-4 py-2 font-semibold">Produção</th>
              <th className="px-4 py-2 font-semibold">Prazos das tarefas</th>
              <th className="px-4 py-2 font-semibold">Recurso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {projetos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {filtrando ? "Nenhum projeto com estes filtros." : "Nenhum projeto no seu acesso."}
                </td>
              </tr>
            ) : (
              projetos.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/acompanhamento/${encodeURIComponent(p.id)}`}
                      className="font-medium text-brand-deep underline-offset-2 hover:underline"
                    >
                      {p.nome}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.contextoNome}
                      {p.pronac ? ` · PRONAC ${p.pronac}` : ""} · {p.acoes} {p.acoes === 1 ? "ação" : "ações"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {p.comunicacao.total ? <Barra pct={p.comunicacao.pct} cor="bg-teal-700" /> : <span className="text-xs text-muted-foreground">Abrir para gerar</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.producao.total ? <Barra pct={p.producao.pct} cor="bg-orange-500" /> : <span className="text-xs text-muted-foreground">Abrir para gerar</span>}
                  </td>
                  <td className="px-4 py-3">
                    {!p.recursoLiberado ? (
                      <span className="text-xs text-muted-foreground">Contam após a liberação</span>
                    ) : p.pedemAtencao === 0 ? (
                      <span className="text-xs font-medium text-emerald-700">Tudo em dia</span>
                    ) : (
                      <div className="space-y-0.5 whitespace-nowrap text-xs">
                        {p.emAtraso ? (
                          <div className="flex items-center gap-1.5 font-semibold text-red-700">
                            <span className="size-2 rounded-full bg-red-600" />
                            {p.emAtraso} em atraso
                          </div>
                        ) : null}
                        {p.vencendo ? (
                          <div className="flex items-center gap-1.5 text-amber-800">
                            <span className="size-2 rounded-full bg-amber-500" />
                            {p.vencendo} {p.vencendo === 1 ? "vence" : "vencem"} em até 3 dias
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.recursoLiberado ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Liberado</span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Aguardando</span>
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
