"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { BarChart3, ChevronDown, ChevronRight, Flag, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker, DateRangePicker } from "@/components/ui/date-picker";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import {
  addAgendaAction,
  addComentarioAction,
  atualizarPreDefinicaoProjetoAction,
  createTarefaAvulsaAction,
  editTarefaAction,
  listComentariosAction,
  removeAgendaAction,
  setDatasProjetoAction,
  setTarefaStatusAction,
} from "@/app/actions/acompanhamento";
import {
  AREA_LABEL,
  FASE_LABEL,
  FASES_NIVEL1,
  FASES_NIVEL2,
  GESTAO_LABEL,
  STATUS_LABEL,
  type AcompanhamentoDTO,
  type AreaTarefa,
  type ComentarioDTO,
  type FaseTarefa,
  type StatusGestao,
  type StatusTarefa,
  type TarefaDTO,
} from "@/lib/acompanhamento/types";

export type Aba = "comunicacao" | "producao" | "configuracao";

const ABA_AREA: Record<"comunicacao" | "producao", AreaTarefa> = {
  comunicacao: "COMUNICACAO",
  producao: "PRODUCAO",
};

const STATUS_ORDEM: StatusTarefa[] = ["NAO_CONTEMPLADA", "NAO_INICIADA", "EM_ANDAMENTO", "CONCLUIDA"];

const STATUS_DOT: Record<StatusTarefa, string> = {
  NAO_CONTEMPLADA: "bg-slate-300",
  NAO_INICIADA: "bg-slate-500",
  EM_ANDAMENTO: "bg-amber-500",
  CONCLUIDA: "bg-emerald-600",
};

const STATUS_CHIP: Record<StatusTarefa, string> = {
  NAO_CONTEMPLADA: "border-border bg-white text-muted-foreground",
  NAO_INICIADA: "border-slate-300 bg-slate-100 text-slate-700",
  EM_ANDAMENTO: "border-amber-300 bg-amber-100 text-amber-900",
  CONCLUIDA: "border-emerald-300 bg-emerald-100 text-emerald-800",
};

const GESTAO_COR: Record<StatusGestao, string> = {
  AGUARDANDO_LIBERACAO: "bg-slate-300",
  NAO_CONTEMPLADA: "bg-slate-200",
  CONCLUIDA: "bg-emerald-600",
  SEM_PRAZO: "bg-slate-300",
  NO_PRAZO: "bg-emerald-600",
  PRAZO_PROXIMO: "bg-amber-500",
  EM_ATRASO: "bg-red-600",
};

const CRITICIDADE: Record<StatusGestao, number> = {
  EM_ATRASO: 0,
  PRAZO_PROXIMO: 1,
  NO_PRAZO: 2,
  SEM_PRAZO: 3,
  AGUARDANDO_LIBERACAO: 4,
  CONCLUIDA: 5,
  NAO_CONTEMPLADA: 6,
};

function fmtDia(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtCurto(iso: string | null) {
  if (!iso) return "sem prazo";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "09/11" ou "09/11 a 11/11" (período da realização). */
function periodoCurto(g: { data: string; dataFim: string | null }) {
  return g.dataFim && g.dataFim !== g.data ? `${fmtCurto(g.data)} a ${fmtCurto(g.dataFim)}` : fmtCurto(g.data);
}

function pct(ts: TarefaDTO[]) {
  const validas = ts.filter((t) => t.status !== "NAO_CONTEMPLADA");
  if (!validas.length) return 0;
  return Math.round((validas.filter((t) => t.status === "CONCLUIDA").length / validas.length) * 100);
}

function Progresso({ valor, cor }: { valor: number; cor: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", cor)} style={{ width: `${valor}%` }} />
    </div>
  );
}

function GestaoBadge({ s }: { s: StatusGestao }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", GESTAO_COR[s])} />
      <span
        className={cn(
          s === "EM_ATRASO" && "font-medium text-red-700",
          s === "PRAZO_PROXIMO" && "text-amber-800",
        )}
      >
        {GESTAO_LABEL[s]}
      </span>
    </span>
  );
}

export function AcompanhamentoView({ data, abaInicial }: { data: AcompanhamentoDTO; abaInicial: Aba }) {
  const router = useRouter();
  const pathname = usePathname();
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [aberta, setAberta] = useState<TarefaDTO | null>(null);
  const [avulsa, setAvulsa] = useState<{ area: AreaTarefa; nivel: 1 | 2 } | null>(null);
  const [pending, startTransition] = useTransition();

  const acaoNome = useMemo(() => new Map(data.acoes.map((a) => [a.id, a.nome])), [data.acoes]);
  const agendaPorId = useMemo(
    () => new Map(data.acoes.flatMap((a) => a.agenda.map((g) => [g.id, g] as const))),
    [data.acoes],
  );

  function trocarAba(a: Aba) {
    setAba(a);
    router.replace(`${pathname}?aba=${a}`, { scroll: false });
  }

  function mudarStatus(t: TarefaDTO, status: StatusTarefa) {
    startTransition(async () => {
      const r = await setTarefaStatusAction(t.id, status);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  const podeArea = (a: AreaTarefa) => (a === "COMUNICACAO" ? data.pode.comunicacao : data.pode.producao);

  /** Rótulo da realização: "Oficina de Teatro · 09/11 · Januária/MG". */
  function rotuloRealizacao(t: Pick<TarefaDTO, "acaoId" | "agendaId">) {
    const nome = t.acaoId ? acaoNome.get(t.acaoId) ?? "Ação" : "Ação";
    const g = t.agendaId ? agendaPorId.get(t.agendaId) : null;
    if (!g) return `${nome} · sem data`;
    return [nome, g.titulo || periodoCurto(g), g.local].filter(Boolean).join(" · ");
  }

  const liberado = Boolean(data.recursoLiberadoEm);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/dashboard/acompanhamento" className="text-xs text-muted-foreground hover:text-brand-deep">
            ← Acompanhamento
          </Link>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">{data.projeto.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {data.projeto.contextoNome}
            {data.projeto.pronac ? ` · PRONAC ${data.projeto.pronac}` : ""}
            {data.inicioExecucao || data.fimExecucao
              ? ` · Execução ${fmtDia(data.inicioExecucao)} a ${fmtDia(data.fimExecucao)}`
              : " · Execução sem datas"}
          </p>
          <Link
            href={`/projeto/${encodeURIComponent(data.projeto.id)}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-800 hover:underline"
          >
            <BarChart3 className="size-4" /> Indicadores do projeto (inscrições e ações)
          </Link>
        </div>
        <div className="text-right text-xs">
          {liberado ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              Recurso liberado em {fmtDia(data.recursoLiberadoEm)}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              Aguardando liberação do recurso
            </span>
          )}
        </div>
      </div>

      {!liberado ? (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          As tarefas começam a valer quando o recurso for liberado: o sistema detecta a primeira
          transferência no MAX Financeiro. Até lá, nada aparece como atrasado.
        </p>
      ) : null}
      {!data.inicioExecucao && data.pode.gestao ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Informe as datas de execução em{" "}
          <button type="button" className="font-semibold underline" onClick={() => trocarAba("configuracao")}>
            Configuração
          </button>{" "}
          para calcular os prazos das tarefas do projeto.
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-white p-1 text-sm" aria-label="Áreas">
        {(
          [
            ["comunicacao", "Comunicação"],
            ["producao", "Produção"],
            ["configuracao", "Configuração"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => trocarAba(id)}
            aria-current={aba === id ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium transition",
              aba === id ? "bg-brand-deep text-white" : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {aba === "configuracao" ? (
        <Configuracao data={data} />
      ) : (
        <AreaPainel
          area={ABA_AREA[aba]}
          tarefas={data.tarefas.filter((t) => t.area === ABA_AREA[aba])}
          podeEditar={podeArea(ABA_AREA[aba])}
          pending={pending}
          onStatus={mudarStatus}
          onAbrir={setAberta}
          onAvulsa={(nivel) => setAvulsa({ area: ABA_AREA[aba], nivel })}
          rotuloRealizacao={rotuloRealizacao}
        />
      )}

      {aberta ? (
        <TarefaDialog
          tarefa={aberta}
          podeEditar={podeArea(aberta.area)}
          podeComentar={podeArea(aberta.area) || data.pode.gestao}
          contexto={aberta.nivel === 2 ? (aberta.unidade === "CIDADE" ? `${aberta.cidade}, ${aberta.uf}` : rotuloRealizacao(aberta)) : null}
          onClose={() => setAberta(null)}
          onStatus={(s) => mudarStatus(aberta, s)}
        />
      ) : null}
      {avulsa ? (
        <AvulsaDialog projetoId={data.projeto.id} area={avulsa.area} nivel={avulsa.nivel} data={data} onClose={() => setAvulsa(null)} />
      ) : null}
    </div>
  );
}

function StatusChip({
  t,
  podeEditar,
  pending,
  onStatus,
}: {
  t: TarefaDTO;
  podeEditar: boolean;
  pending: boolean;
  onStatus: (t: TarefaDTO, s: StatusTarefa) => void;
}) {
  if (!podeEditar) {
    return (
      <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_CHIP[t.status])}>
        {STATUS_LABEL[t.status]}
      </span>
    );
  }
  return (
    <SimpleSelect
      aria-label={`Status de ${t.titulo}`}
      value={t.status}
      disabled={pending}
      size="sm"
      onChange={(v) => onStatus(t, v as StatusTarefa)}
      className={cn("h-7 cursor-pointer rounded-full px-2.5 text-xs font-medium", STATUS_CHIP[t.status])}
      options={STATUS_ORDEM.map((s) => ({ value: s, label: STATUS_LABEL[s], dot: STATUS_DOT[s] }))}
    />
  );
}

type AreaProps = {
  area: AreaTarefa;
  tarefas: TarefaDTO[];
  podeEditar: boolean;
  pending: boolean;
  onStatus: (t: TarefaDTO, s: StatusTarefa) => void;
  onAbrir: (t: TarefaDTO) => void;
  onAvulsa: (nivel: 1 | 2) => void;
  rotuloRealizacao: (t: Pick<TarefaDTO, "acaoId" | "agendaId">) => string;
};

function AreaPainel(props: AreaProps) {
  const n1 = props.tarefas.filter((t) => t.nivel === 1);
  const n2 = props.tarefas.filter((t) => t.nivel === 2);
  const corBarra = props.area === "COMUNICACAO" ? "bg-teal-700" : "bg-orange-500";
  const atrasoN1 = n1.filter((t) => t.gestao === "EM_ATRASO").length;

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {props.podeEditar
          ? `Equipe de ${AREA_LABEL[props.area]} atualiza; as demais áreas e a gestão consultam.`
          : `Só consulta: quem atualiza é a equipe de ${AREA_LABEL[props.area]}.`}
      </p>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold text-brand-deep">
            Nível 1 · Projeto{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {n1.length} tarefas · {n1.filter((t) => t.status === "CONCLUIDA").length} concluídas
              {atrasoN1 ? ` · ${atrasoN1} em atraso` : ""}
            </span>
          </h2>
          {props.podeEditar ? (
            <Button variant="outline" size="sm" onClick={() => props.onAvulsa(1)}>
              <Plus className="size-4" /> Tarefa avulsa
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {FASES_NIVEL1.map((fase) => {
            const ts = n1.filter((t) => t.fase === fase);
            const concl = ts.filter((t) => t.status === "CONCLUIDA").length;
            return (
              <div key={fase} className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-semibold text-brand-deep">{FASE_LABEL[fase]}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {concl}/{ts.filter((t) => t.status !== "NAO_CONTEMPLADA").length}
                  </span>
                </div>
                <Progresso valor={pct(ts)} cor={corBarra} />
                <ul className="mt-3 space-y-2">
                  {ts.length === 0 ? <li className="text-xs text-muted-foreground">Sem tarefas.</li> : null}
                  {ts.map((t) => (
                    <li key={t.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => props.onAbrir(t)}
                        className={cn(
                          "text-left text-sm leading-snug hover:text-brand-deep hover:underline",
                          t.status === "NAO_CONTEMPLADA" && "text-muted-foreground line-through",
                        )}
                      >
                        {t.titulo}
                      </button>
                      {t.prazo ? (
                        <div className="text-xs tabular-nums text-muted-foreground">Prazo {fmtCurto(t.prazo)}</div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip t={t} podeEditar={props.podeEditar} pending={props.pending} onStatus={props.onStatus} />
                        {t.gestao === "EM_ATRASO" || t.gestao === "PRAZO_PROXIMO" ? (
                          <GestaoBadge s={t.gestao} />
                        ) : null}
                        {t.escaladasAbertas ? <Flag className="size-3.5 text-red-600" aria-label="Escalada à gestão" /> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <Nivel2 {...props} tarefas={n2} corBarra={corBarra} />
    </div>
  );
}

type Grupo = { chave: string; titulo: string; subtitulo: string; tarefas: TarefaDTO[]; data: string | null };

function Nivel2(props: AreaProps & { corBarra: string }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [mostrarConcluidas, setMostrarConcluidas] = useState<Set<string>>(new Set());

  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, Grupo>();
    for (const t of props.tarefas) {
      let chave: string;
      let titulo: string;
      const subtitulo = "";
      if (props.area === "PRODUCAO") {
        // Produção se organiza por cidade (uma cidade pode receber várias ações).
        chave = t.cidade ? `${t.cidade}/${t.uf}`.toLowerCase() : `sem-cidade:${t.acaoId ?? ""}`;
        titulo = t.cidade ? `${t.cidade}, ${t.uf}` : props.rotuloRealizacao(t);
      } else {
        chave = t.agendaId ?? `acao:${t.acaoId ?? "?"}`;
        titulo = props.rotuloRealizacao(t);
      }
      const g = m.get(chave) || { chave, titulo, subtitulo, tarefas: [], data: null };
      g.tarefas.push(t);
      if (t.prazo && (!g.data || t.prazo < g.data)) g.data = t.prazo;
      m.set(chave, g);
    }
    const lista = [...m.values()];
    for (const g of lista) {
      const ativas = g.tarefas.filter((t) => t.status !== "CONCLUIDA" && t.status !== "NAO_CONTEMPLADA");
      g.subtitulo = `${g.tarefas.length} tarefas · ${ativas.length} em aberto`;
    }
    const pior = (g: Grupo) => Math.min(...g.tarefas.map((t) => CRITICIDADE[t.gestao]));
    return lista.sort((a, b) => pior(a) - pior(b) || (a.data ?? "").localeCompare(b.data ?? ""));
  }, [props]);

  const toggle = (set: Set<string>, k: string) => {
    const n = new Set(set);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-brand-deep">
          Nível 2 · {props.area === "PRODUCAO" ? "Cidades" : "Ações"}{" "}
          <span className="text-sm font-normal text-muted-foreground">ordenadas pela criticidade</span>
        </h2>
        {props.podeEditar && grupos.length ? (
          <Button variant="outline" size="sm" onClick={() => props.onAvulsa(2)}>
            <Plus className="size-4" /> Tarefa avulsa
          </Button>
        ) : null}
      </div>

      {grupos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma ação com data na agenda. A gestão cadastra as datas e cidades das ações em Configuração.
        </p>
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-white shadow-sm">
          {grupos.map((g) => {
            const aberto = abertos.has(g.chave);
            const piorTarefa = [...g.tarefas].sort((a, b) => CRITICIDADE[a.gestao] - CRITICIDADE[b.gestao])[0]!;
            const alerta =
              piorTarefa.gestao === "EM_ATRASO"
                ? `${piorTarefa.titulo} em atraso`
                : piorTarefa.gestao === "PRAZO_PROXIMO"
                  ? `${piorTarefa.titulo}: prazo próximo`
                  : null;
            const concluidas = g.tarefas.filter((t) => t.status === "CONCLUIDA" || t.status === "NAO_CONTEMPLADA");
            const visiveis = mostrarConcluidas.has(g.chave) ? g.tarefas : g.tarefas.filter((t) => !concluidas.includes(t));
            return (
              <div key={g.chave}>
                <button
                  type="button"
                  onClick={() => setAbertos((s) => toggle(s, g.chave))}
                  aria-expanded={aberto}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/30 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]"
                >
                  {aberto ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-brand-deep">{g.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{g.subtitulo}</span>
                  </span>
                  <span className="col-start-2 flex items-center gap-2 sm:col-start-auto">
                    <Progresso valor={pct(g.tarefas)} cor={props.corBarra} />
                    <span className="w-9 text-xs tabular-nums text-muted-foreground">{pct(g.tarefas)}%</span>
                  </span>
                  <span className="col-start-2 text-xs sm:col-start-auto">
                    {alerta ? (
                      <span className={cn("inline-flex items-center gap-1.5", piorTarefa.gestao === "EM_ATRASO" ? "text-red-700" : "text-amber-800")}>
                        <span className={cn("h-2 w-2 rounded-full", GESTAO_COR[piorTarefa.gestao])} />
                        {alerta}
                      </span>
                    ) : (
                      <GestaoBadge s={piorTarefa.gestao} />
                    )}
                  </span>
                </button>
                {aberto ? (
                  <div className="border-t border-border/50 bg-muted/10 px-4 py-3">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="pb-2 font-medium">Tarefa</th>
                          <th className="hidden pb-2 font-medium sm:table-cell">Fase</th>
                          <th className="pb-2 font-medium">Prazo</th>
                          <th className="pb-2 font-medium">Status da equipe</th>
                          <th className="hidden pb-2 font-medium md:table-cell">Gestão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {visiveis.map((t) => (
                          <tr key={t.id}>
                            <td className="py-2 pr-3">
                              <button type="button" onClick={() => props.onAbrir(t)} className="text-left hover:text-brand-deep hover:underline">
                                {t.titulo}
                              </button>
                              {props.area === "PRODUCAO" && t.unidade === "ACAO" ? (
                                <div className="text-xs text-muted-foreground">{props.rotuloRealizacao(t)}</div>
                              ) : null}
                              {props.area === "PRODUCAO" && t.unidade === "CIDADE" ? (
                                <div className="text-xs font-medium text-teal-800">Cidade</div>
                              ) : null}
                            </td>
                            <td className="hidden py-2 pr-3 text-xs text-muted-foreground sm:table-cell">{FASE_LABEL[t.fase]}</td>
                            <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap">{fmtCurto(t.prazo)}</td>
                            <td className="py-2 pr-3">
                              <span className="inline-flex items-center gap-2">
                                <StatusChip t={t} podeEditar={props.podeEditar} pending={props.pending} onStatus={props.onStatus} />
                                {t.comentarios ? (
                                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                                    <MessageSquare className="size-3.5" />
                                    {t.comentarios}
                                  </span>
                                ) : null}
                                {t.escaladasAbertas ? <Flag className="size-3.5 text-red-600" aria-label="Escalada à gestão" /> : null}
                              </span>
                            </td>
                            <td className="hidden py-2 md:table-cell">
                              <GestaoBadge s={t.gestao} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {concluidas.length ? (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-teal-800 hover:underline"
                        onClick={() => setMostrarConcluidas((s) => toggle(s, g.chave))}
                      >
                        {mostrarConcluidas.has(g.chave)
                          ? "Esconder concluídas e não contempladas"
                          : `Mostrar ${concluidas.length} concluída(s) ou não contemplada(s)`}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TarefaDialog({
  tarefa,
  podeEditar,
  podeComentar,
  contexto,
  onClose,
  onStatus,
}: {
  tarefa: TarefaDTO;
  podeEditar: boolean;
  podeComentar: boolean;
  contexto: string | null;
  onClose: () => void;
  onStatus: (s: StatusTarefa) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [detalhamento, setDetalhamento] = useState(tarefa.detalhamento);
  const [prazo, setPrazo] = useState(tarefa.prazo ?? "");
  const [comentarios, setComentarios] = useState<ComentarioDTO[] | null>(null);
  const [texto, setTexto] = useState("");
  const [escalar, setEscalar] = useState(false);

  useEffect(() => {
    let vivo = true;
    void listComentariosAction(tarefa.id).then((c) => vivo && setComentarios(c));
    return () => {
      vivo = false;
    };
  }, [tarefa.id]);

  function salvar() {
    startTransition(async () => {
      const r = await editTarefaAction(tarefa.id, { titulo, detalhamento, prazo: prazo || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Tarefa atualizada");
      router.refresh();
      onClose();
    });
  }

  function comentar() {
    startTransition(async () => {
      const r = await addComentarioAction(tarefa.id, { texto, escalar });
      if (!r.ok) return void toast.error(r.error);
      toast.success(escalar ? "Escalado para a gestão" : "Observação registrada");
      setTexto("");
      setEscalar(false);
      setComentarios(await listComentariosAction(tarefa.id));
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tarefa.titulo}</DialogTitle>
          <DialogDescription>
            {AREA_LABEL[tarefa.area]} · Nível {tarefa.nivel} · {FASE_LABEL[tarefa.fase]}
            {contexto ? ` · ${contexto}` : ""}
            {tarefa.avulsa ? " · avulsa" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <StatusChip t={tarefa} podeEditar={podeEditar} pending={pending} onStatus={(_, s) => onStatus(s)} />
          <GestaoBadge s={tarefa.gestao} />
        </div>

        {podeEditar ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Detalhamento</Label>
              <Textarea rows={3} value={detalhamento} onChange={(e) => setDetalhamento(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <DatePicker value={prazo} onChange={setPrazo} className="w-52" aria-label="Prazo" />
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            {tarefa.detalhamento ? <p className="text-muted-foreground">{tarefa.detalhamento}</p> : null}
            <p>Prazo: {fmtDia(tarefa.prazo)}</p>
          </div>
        )}

        <div className="space-y-2 border-t border-border/60 pt-3">
          <h3 className="text-sm font-semibold text-brand-deep">Observações</h3>
          {comentarios && comentarios.length ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {comentarios.map((c) => (
                <li key={c.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.autorNome}</span>
                    <span>{new Date(c.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                    {c.escalada ? (
                      <span className="inline-flex items-center gap-1 font-medium text-red-700">
                        <Flag className="size-3" /> Escalada{c.resolvida ? " (resolvida)" : ""}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap">{c.texto}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma observação.</p>
          )}
          {podeComentar ? (
            <div className="space-y-2">
              <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma observação" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={escalar} onChange={(e) => setEscalar(e.target.checked)} className="size-4 accent-red-600" />
                Escalar para a gestão
              </label>
              <Button variant="outline" size="sm" disabled={pending || !texto.trim()} onClick={comentar}>
                {escalar ? "Escalar" : "Adicionar observação"}
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {podeEditar ? (
            <Button disabled={pending} onClick={salvar}>
              Salvar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvulsaDialog({
  projetoId,
  area,
  nivel,
  data,
  onClose,
}: {
  projetoId: string;
  area: AreaTarefa;
  nivel: 1 | 2;
  data: AcompanhamentoDTO;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [fase, setFase] = useState<FaseTarefa>(nivel === 1 ? "PLANEJAMENTO" : "ANTES");
  const [prazo, setPrazo] = useState("");
  const realizacoes = data.acoes.flatMap((a) => a.agenda.map((g) => ({ a, g })));
  const [alvo, setAlvo] = useState(realizacoes[0] ? `ag:${realizacoes[0].g.id}` : "");

  function criar() {
    const ag = alvo.startsWith("ag:") ? realizacoes.find((r) => r.g.id === alvo.slice(3)) : null;
    const cidade = alvo.startsWith("cid:") ? alvo.slice(4).split("|") : null;
    startTransition(async () => {
      const r = await createTarefaAvulsaAction(projetoId, {
        area,
        nivel,
        fase,
        titulo,
        prazo: prazo || null,
        acaoId: ag?.a.id ?? null,
        agendaId: ag?.g.id ?? null,
        cidade: ag?.g.cidade ?? cidade?.[0] ?? null,
        uf: ag?.g.uf ?? cidade?.[1] ?? null,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Tarefa criada");
      router.refresh();
      onClose();
    });
  }

  const cidades = [...new Map(realizacoes.filter(({ g }) => !g.online).map(({ g }) => [`${g.cidade}|${g.uf}`, g])).values()];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tarefa avulsa · {AREA_LABEL[area]}</DialogTitle>
          <DialogDescription>Fora do padrão, só neste projeto. Nível {nivel}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Fase</Label>
            <SimpleSelect
              value={fase}
              onChange={(v) => setFase(v as FaseTarefa)}
              className="h-9 w-full"
              aria-label="Fase"
              options={(nivel === 1 ? FASES_NIVEL1 : FASES_NIVEL2).map((f) => ({ value: f, label: FASE_LABEL[f] }))}
            />
          </div>
          {nivel === 2 ? (
            <div className="space-y-1.5">
              <Label>{area === "PRODUCAO" ? "Ação ou cidade" : "Ação"}</Label>
              <SimpleSelect
                value={alvo}
                onChange={setAlvo}
                className="h-9 w-full"
                aria-label={area === "PRODUCAO" ? "Ação ou cidade" : "Ação"}
                options={[
                  ...realizacoes.map(({ a, g }) => ({
                    value: `ag:${g.id}`,
                    label: `${a.nome} · ${g.titulo || periodoCurto(g)} · ${g.local}`,
                  })),
                  ...(area === "PRODUCAO"
                    ? cidades.map((g) => ({ value: `cid:${g.cidade}|${g.uf}`, label: `Cidade: ${g.cidade}, ${g.uf}` }))
                    : []),
                ]}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Prazo (opcional)</Label>
            <DatePicker value={prazo} onChange={setPrazo} className="w-52" aria-label="Prazo" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || !titulo.trim() || (nivel === 2 && !alvo)} onClick={criar}>
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Configuracao({ data }: { data: AcompanhamentoDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inicio, setInicio] = useState(data.inicioExecucao ?? "");
  const [fim, setFim] = useState(data.fimExecucao ?? "");
  const [nova, setNova] = useState<Record<string, { titulo: string; data: string; dataFim: string; local: string }>>({});
  const pode = data.pode.gestao;

  function atualizarPreDefinicao() {
    if (!window.confirm("Usar a pré-definição atual neste projeto? Tarefas novas entram e as datas não editadas à mão são recalculadas.")) return;
    startTransition(async () => {
      const r = await atualizarPreDefinicaoProjetoAction(data.projeto.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Projeto atualizado para a pré-definição atual");
      router.refresh();
    });
  }

  function salvarDatas() {
    startTransition(async () => {
      const r = await setDatasProjetoAction(data.projeto.id, { inicioExecucao: inicio || null, fimExecucao: fim || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Datas salvas; prazos recalculados");
      router.refresh();
    });
  }

  function adicionar(acaoId: string) {
    const v = nova[acaoId];
    if (!v) return;
    startTransition(async () => {
      const r = await addAgendaAction(acaoId, {
        titulo: v.titulo,
        data: v.data,
        dataFim: v.dataFim,
        online: v.local === "online",
        territorioId: v.local === "online" ? null : v.local,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Execução adicionada; tarefas geradas");
      setNova((s) => ({ ...s, [acaoId]: { titulo: "", data: "", dataFim: "", local: v.local } }));
      router.refresh();
    });
  }

  function remover(agendaId: string) {
    if (!window.confirm("Remover esta data? As tarefas dela também saem.")) return;
    startTransition(async () => {
      const r = await removeAgendaAction(agendaId);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {!pode ? (
        <p className="text-sm text-muted-foreground">Só consulta: a gestão do acompanhamento altera datas e agenda.</p>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">Execução do projeto</h2>
          <p className="text-sm text-muted-foreground">Base dos prazos do nível 1 (ex.: datas do SALIC).</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm space-y-1.5">
            <Label>Período de execução</Label>
            <DateRangePicker
              inicio={inicio}
              fim={fim}
              disabled={!pode}
              aria-label="Período de execução do projeto"
              onChange={(a, b) => {
                setInicio(a);
                setFim(b);
              }}
            />
          </div>
          {pode ? (
            <Button disabled={pending} onClick={salvarDatas}>
              Salvar datas
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {data.recursoLiberadoEm
            ? `Recurso liberado em ${fmtDia(data.recursoLiberadoEm)} (detectado no MAX Financeiro).`
            : data.financeiroVinculado
              ? "Projeto encontrado no MAX Financeiro; ainda sem transferência para a conta de movimentação."
              : "Projeto ainda não encontrado no MAX Financeiro pelo PRONAC."}
        </p>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">Pré-definição</h2>
          <p className="text-sm text-muted-foreground">
            Este projeto segue a{" "}
            <Link href="/dashboard/acompanhamento/pre-definicao" className="font-medium text-teal-800 hover:underline">
              pré-definição das tarefas
            </Link>{" "}
            de {fmtDia(data.preDefinicaoEm)}. Mudanças feitas depois só valem para projetos novos.
          </p>
        </div>
        {pode ? (
          <Button variant="outline" disabled={pending} onClick={atualizarPreDefinicao}>
            Usar a pré-definição atual
          </Button>
        ) : null}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">Agenda das ações</h2>
          <p className="text-sm text-muted-foreground">
            Cada execução da ação: período e território (os cadastrados na ação, em Contextos). As tarefas de
            nível 2 são geradas a partir daqui, com o prazo contado do início ou do fim da execução da ação.
          </p>
        </div>
        {data.acoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este projeto ainda não tem ações. Cadastre em Contextos.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.acoes.map((a) => {
              const locais = [
                ...a.territorios.map((t) => ({ value: t.id, label: t.label })),
                ...(a.ofereceOnline ? [{ value: "online", label: "Online" }] : []),
              ];
              const v = nova[a.id] ?? { titulo: "", data: "", dataFim: "", local: locais.length === 1 ? locais[0]!.value : "" };
              const set = (k: keyof typeof v, val: string) => setNova((s) => ({ ...s, [a.id]: { ...v, [k]: val } }));
              return (
                <div key={a.id} className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="font-semibold text-brand-deep">{a.nome}</h3>
                    <span className="rounded-full border border-brand/15 bg-brand-mist/60 px-2 py-0.5 text-[11px] font-medium text-brand-deep">
                      {a.tipoNome}
                    </span>
                  </div>
                  {a.agenda.length ? (
                    <ul className="mb-3 divide-y divide-border/50 text-sm">
                      {a.agenda.map((g) => (
                        <li key={g.id} className="flex items-center justify-between gap-2 py-1.5">
                          <span>
                            <span className="tabular-nums">
                              {fmtDia(g.data)}
                              {g.dataFim && g.dataFim !== g.data ? ` a ${fmtDia(g.dataFim)}` : ""}
                            </span>{" "}
                            · {g.local}
                            {g.titulo ? <span className="text-muted-foreground"> · {g.titulo}</span> : null}
                          </span>
                          {pode ? (
                            <button type="button" onClick={() => remover(g.id)} className="text-muted-foreground hover:text-red-700" aria-label="Remover data">
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-xs text-muted-foreground">Sem datas.</p>
                  )}
                  {pode ? (
                    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <span>Período da execução (um clique no início e outro no fim; um dia só = um clique)</span>
                        <DateRangePicker
                          inicio={v.data}
                          fim={v.dataFim}
                          aria-label={`Período de execução de ${a.nome}`}
                          onChange={(ini, fimNovo) => setNova((st) => ({ ...st, [a.id]: { ...v, data: ini, dataFim: fimNovo } }))}
                        />
                      </div>
                      {locais.length ? (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <span>Onde (território cadastrado na ação)</span>
                          <SimpleSelect
                            value={v.local}
                            onChange={(val) => set("local", val)}
                            className="h-9 w-full"
                            aria-label={`Território de ${a.nome}`}
                            options={[{ value: "", label: "Escolha o território" }, ...locais]}
                          />
                        </div>
                      ) : (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Esta ação ainda não tem território.{" "}
                          <Link
                            href={`/dashboard/contextos?tab=acoes&q=${encodeURIComponent(a.nome)}`}
                            className="font-semibold underline"
                          >
                            Cadastre em Contextos
                          </Link>{" "}
                          (zona, cidade e UF, ou online).
                        </p>
                      )}
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <Input
                          value={v.titulo}
                          onChange={(e) => set("titulo", e.target.value)}
                          placeholder="Rótulo (opcional), ex.: Oficina 2"
                          aria-label="Rótulo"
                        />
                        <Button variant="outline" disabled={pending || !v.data || !v.local} onClick={() => adicionar(a.id)}>
                          <Plus className="size-4" /> Adicionar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
