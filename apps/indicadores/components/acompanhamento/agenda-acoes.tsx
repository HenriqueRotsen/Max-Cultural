"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-picker";
import { SimpleSelect } from "@/components/ui/simple-select";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { addAgendaAction, removeAgendaAction } from "@/app/actions/acompanhamento";
import type { AcaoAcompDTO, AcompanhamentoDTO, AreaTarefa, TarefaDTO } from "@/lib/acompanhamento/types";

type Progresso = { total: number; concluidas: number; atraso: number; pct: number | null };

/** Progresso das tarefas de nível 2 de uma ação numa área (não contempladas ficam fora). */
function progressoDe(ts: TarefaDTO[]): Progresso {
  const validas = ts.filter((t) => t.status !== "NAO_CONTEMPLADA");
  const concluidas = validas.filter((t) => t.status === "CONCLUIDA").length;
  return {
    total: validas.length,
    concluidas,
    atraso: ts.filter((t) => t.gestao === "EM_ATRASO").length,
    pct: validas.length ? Math.round((concluidas / validas.length) * 100) : null,
  };
}

function ProgressoCelula({ p, cor }: { p: Progresso; cor: string }) {
  if (p.pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="min-w-24 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", cor)} style={{ width: `${p.pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground" title={`${p.concluidas} de ${p.total} concluídas`}>
          {p.pct}%
        </span>
      </div>
      {p.atraso ? <div className="text-[11px] font-medium text-red-700">{p.atraso} em atraso</div> : null}
    </div>
  );
}

type Ordem = "nome" | "atraso" | "progresso" | "data";

function fmtDia(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function periodo(g: { data: string; dataFim: string | null }) {
  return g.dataFim && g.dataFim !== g.data ? `${fmtDia(g.data)} a ${fmtDia(g.dataFim)}` : fmtDia(g.data);
}

/** Sem acento e minúsculo, para a busca. */
export function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function locaisDa(a: AcaoAcompDTO) {
  return [
    ...a.territorios.map((t) => ({ value: t.id, label: t.label })),
    ...(a.ofereceOnline ? [{ value: "online", label: "Online" }] : []),
  ];
}

type FiltroAgenda = "todas" | "sem-datas" | "com-datas" | "sem-local";

const POR_PAGINA = 50;

/**
 * Agenda das ações em tabela (um projeto pode ter ~150 ações): uma linha por
 * ação e o botão "Configurar" abre a agenda daquela ação num modal.
 */
export function AgendaAcoes({ data }: { data: AcompanhamentoDTO }) {
  const pode = data.pode.gestao;
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const aberta = abertaId ? (data.acoes.find((a) => a.id === abertaId) ?? null) : null;
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroAgenda>("todas");
  const [tipo, setTipo] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [ordem, setOrdem] = useState<Ordem>("nome");

  const progresso = useMemo(() => {
    const m = new Map<string, Record<AreaTarefa, TarefaDTO[]>>();
    for (const t of data.tarefas) {
      if (t.nivel !== 2 || !t.acaoId) continue;
      const r = m.get(t.acaoId) ?? { COMUNICACAO: [], PRODUCAO: [] };
      r[t.area].push(t);
      m.set(t.acaoId, r);
    }
    const vazio = progressoDe([]);
    return (id: string) => {
      const r = m.get(id);
      return {
        COMUNICACAO: r ? progressoDe(r.COMUNICACAO) : vazio,
        PRODUCAO: r ? progressoDe(r.PRODUCAO) : vazio,
      };
    };
  }, [data.tarefas]);

  const tipos = useMemo(
    () => [...new Map(data.acoes.map((a) => [a.tipoId, a.tipoNome])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [data.acoes],
  );

  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    const lista = data.acoes.filter((a) => {
      if (tipo && a.tipoId !== tipo) return false;
      if (filtro === "sem-datas" && a.agenda.length) return false;
      if (filtro === "com-datas" && !a.agenda.length) return false;
      if (filtro === "sem-local" && locaisDa(a).length) return false;
      if (!q) return true;
      const texto = [a.nome, a.tipoNome, ...a.territorios.map((t) => t.label), ...a.agenda.map((g) => `${g.titulo} ${g.local}`)].join(" ");
      return normalizar(texto).includes(q);
    });
    if (ordem === "nome") return lista;
    const chave = (a: AcaoAcompDTO) => {
      const p = progresso(a.id);
      if (ordem === "atraso") return -(p.COMUNICACAO.atraso + p.PRODUCAO.atraso);
      if (ordem === "progresso") {
        const total = p.COMUNICACAO.total + p.PRODUCAO.total;
        return total ? (p.COMUNICACAO.concluidas + p.PRODUCAO.concluidas) / total : 2;
      }
      return a.agenda[0] ? Date.parse(a.agenda[0].data) : Infinity;
    };
    return [...lista].sort((a, b) => chave(a) - chave(b) || a.nome.localeCompare(b.nome));
  }, [data.acoes, busca, filtro, tipo, ordem, progresso]);

  const semDatas = data.acoes.filter((a) => !a.agenda.length).length;
  const execucoes = data.acoes.reduce((n, a) => n + a.agenda.length, 0);
  const visiveis = filtradas.slice(0, limite);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand-deep">
          Agenda das ações{" "}
          {data.acoes.length ? (
            <span className="text-sm font-normal text-muted-foreground">
              {data.acoes.length} {data.acoes.length === 1 ? "ação" : "ações"} · {execucoes}{" "}
              {execucoes === 1 ? "execução" : "execuções"}
              {semDatas ? ` · ${semDatas} sem datas` : ""}
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-muted-foreground">
          Cada execução da ação: período e território (os cadastrados na ação, em Contextos). As tarefas de nível 2 são
          geradas a partir daqui, com o prazo contado do início ou do fim da execução da ação.
        </p>
      </div>

      {data.acoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este projeto ainda não tem ações. Cadastre em Contextos.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setLimite(POR_PAGINA);
                }}
                placeholder="Buscar ação, território ou rótulo"
                aria-label="Buscar ação"
                className="h-9 bg-white pl-8"
              />
            </div>
            <SimpleSelect
              value={filtro}
              onChange={(v) => {
                setFiltro(v as FiltroAgenda);
                setLimite(POR_PAGINA);
              }}
              className="h-9 w-44"
              aria-label="Filtrar pela agenda"
              options={[
                { value: "todas", label: "Todas as ações" },
                { value: "sem-datas", label: "Sem datas" },
                { value: "com-datas", label: "Com datas" },
                { value: "sem-local", label: "Sem território" },
              ]}
            />
            {tipos.length > 1 ? (
              <SimpleSelect
                value={tipo}
                onChange={(v) => {
                  setTipo(v);
                  setLimite(POR_PAGINA);
                }}
                className="h-9 w-48"
                aria-label="Filtrar pelo tipo de ação"
                options={[{ value: "", label: "Todos os tipos" }, ...tipos.map(([id, nome]) => ({ value: id, label: nome }))]}
              />
            ) : null}
            <SimpleSelect
              value={ordem}
              onChange={(v) => setOrdem(v as Ordem)}
              className="h-9 w-48"
              aria-label="Ordenar ações"
              options={[
                { value: "nome", label: "Ordem: nome" },
                { value: "atraso", label: "Ordem: mais atrasos" },
                { value: "progresso", label: "Ordem: menor progresso" },
                { value: "data", label: "Ordem: primeira data" },
              ]}
            />
            {filtradas.length !== data.acoes.length ? (
              <span className="text-xs text-muted-foreground">
                {filtradas.length} de {data.acoes.length}
              </span>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-brand-mist/50 text-left text-xs text-brand-deep">
                <tr>
                  <th className="px-4 py-2 font-semibold">Ação</th>
                  <th className="hidden px-4 py-2 font-semibold md:table-cell">Onde pode acontecer</th>
                  <th className="px-4 py-2 font-semibold">Execuções</th>
                  <th className="hidden px-4 py-2 font-semibold sm:table-cell">Período</th>
                  <th className="hidden px-4 py-2 font-semibold lg:table-cell">Comunicação</th>
                  <th className="hidden px-4 py-2 font-semibold lg:table-cell">Produção</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    <span className="sr-only">Configurar</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {visiveis.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhuma ação com estes filtros.
                    </td>
                  </tr>
                ) : (
                  visiveis.map((a) => {
                    const locais = locaisDa(a);
                    const primeira = a.agenda[0];
                    const ultima = a.agenda[a.agenda.length - 1];
                    const prog = progresso(a.id);
                    return (
                      <tr key={a.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-brand-deep">{a.nome}</div>
                          <div className="text-xs text-muted-foreground">{a.tipoNome}</div>
                        </td>
                        <td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">
                          {locais.length ? (
                            locais.length === 1 ? (
                              locais[0]!.label
                            ) : (
                              <span title={locais.map((l) => l.label).join("\n")}>{locais.length} territórios</span>
                            )
                          ) : (
                            <span className="font-medium text-amber-800">Sem território</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {a.agenda.length ? (
                            <span className="tabular-nums">{a.agenda.length}</span>
                          ) : (
                            <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                              Sem datas
                            </span>
                          )}
                        </td>
                        <td className="hidden px-4 py-2.5 text-xs tabular-nums text-muted-foreground sm:table-cell">
                          {primeira
                            ? a.agenda.length === 1
                              ? periodo(primeira)
                              : `${fmtDia(primeira.data)} a ${fmtDia(ultima!.dataFim ?? ultima!.data)}`
                            : "—"}
                        </td>
                        <td className="hidden px-4 py-2.5 lg:table-cell">
                          <ProgressoCelula p={prog.COMUNICACAO} cor="bg-teal-700" />
                        </td>
                        <td className="hidden px-4 py-2.5 lg:table-cell">
                          <ProgressoCelula p={prog.PRODUCAO} cor="bg-orange-500" />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button variant="outline" size="sm" onClick={() => setAbertaId(a.id)}>
                            <Settings2 className="size-4" /> {pode ? "Configurar" : "Ver"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {filtradas.length > limite ? (
              <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
                <span>
                  Mostrando {visiveis.length} de {filtradas.length}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setLimite((l) => l + POR_PAGINA)}>
                  Mostrar mais {Math.min(POR_PAGINA, filtradas.length - limite)}
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {aberta ? <AgendaAcaoDialog acao={aberta} pode={pode} onClose={() => setAbertaId(null)} /> : null}
    </section>
  );
}

/** A mesma edição que o card da ação fazia: lista de execuções + nova execução. */
function AgendaAcaoDialog({ acao: a, pode, onClose }: { acao: AcaoAcompDTO; pode: boolean; onClose: () => void }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [pending, startTransition] = useTransition();
  const locais = locaisDa(a);
  const vazio = { titulo: "", data: "", dataFim: "", local: locais.length === 1 ? locais[0]!.value : "" };
  const [v, setV] = useState(vazio);

  function adicionar() {
    startTransition(async () => {
      const r = await addAgendaAction(a.id, {
        titulo: v.titulo,
        data: v.data,
        dataFim: v.dataFim,
        online: v.local === "online",
        territorioId: v.local === "online" ? null : v.local,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Execução adicionada; tarefas geradas");
      setV({ ...vazio, local: v.local });
      router.refresh();
    });
  }

  async function remover(agendaId: string) {
    const ok = await confirmar({
      title: "Remover esta execução da agenda?",
      description: "As tarefas e a ficha da prestação de contas desta execução também saem, incluindo fotos e documentos.",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await removeAgendaAction(agendaId);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{a.nome}</DialogTitle>
          <DialogDescription>
            {a.tipoNome} · {a.agenda.length ? `${a.agenda.length} ${a.agenda.length === 1 ? "execução" : "execuções"}` : "sem datas"}
          </DialogDescription>
        </DialogHeader>

        {a.agenda.length ? (
          <ul className="divide-y divide-border/50 rounded-xl border border-border/60 text-sm">
            {a.agenda.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span>
                  <span className="tabular-nums">{periodo(g)}</span> · {g.local}
                  {g.titulo ? <span className="text-muted-foreground"> · {g.titulo}</span> : null}
                </span>
                {pode ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remover(g.id)}
                    className="text-muted-foreground hover:text-red-700"
                    aria-label={`Remover execução de ${periodo(g)}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Sem datas.</p>
        )}

        {pode ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nova execução</div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <span>Período da execução (um clique no início e outro no fim; um dia só = um clique)</span>
              <DateRangePicker
                inicio={v.data}
                fim={v.dataFim}
                aria-label={`Período de execução de ${a.nome}`}
                onChange={(ini, fimNovo) => setV((s) => ({ ...s, data: ini, dataFim: fimNovo }))}
              />
            </div>
            {locais.length ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <span>Onde (território cadastrado na ação)</span>
                <SimpleSelect
                  value={v.local}
                  onChange={(val) => setV((s) => ({ ...s, local: val }))}
                  className="h-9 w-full"
                  aria-label={`Território de ${a.nome}`}
                  options={[{ value: "", label: "Escolha o território" }, ...locais]}
                />
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Esta ação ainda não tem território.{" "}
                <Link href={`/dashboard/contextos?tab=acoes&q=${encodeURIComponent(a.nome)}`} className="font-semibold underline">
                  Cadastre em Contextos
                </Link>{" "}
                (zona, cidade e UF, ou online).
              </p>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                value={v.titulo}
                onChange={(e) => setV((s) => ({ ...s, titulo: e.target.value }))}
                placeholder="Rótulo (opcional), ex.: Oficina 2"
                aria-label="Rótulo"
                className="bg-white"
              />
              <Button variant="outline" disabled={pending || !v.data || !v.local} onClick={adicionar}>
                <Plus className="size-4" /> Adicionar
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className={cn(pending && "opacity-80")}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
