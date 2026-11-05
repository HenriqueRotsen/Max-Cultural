"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { moverModeloAction, salvarModeloAction, setModeloAtivoAction, type ModeloInput } from "@/app/actions/predefinicao";
import {
  AREA_LABEL,
  FASE_LABEL,
  FASES_NIVEL1,
  FASES_NIVEL2,
  BASE_LABEL,
  notacaoD,
  regraLabel,
  type AreaTarefa,
  type FaseTarefa,
  type ModeloDTO,
  type PrazoBase,
} from "@/lib/acompanhamento/types";

type Tipo = { id: string; nome: string };

const SELECT = "h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

export function PreDefinicaoEditor({ modelos, tiposAcao, pode }: { modelos: ModeloDTO[]; tiposAcao: Tipo[]; pode: boolean }) {
  const router = useRouter();
  const [area, setArea] = useState<AreaTarefa>("COMUNICACAO");
  const [editando, setEditando] = useState<ModeloInput | null>(null);
  const [verRemovidas, setVerRemovidas] = useState(false);
  const [pending, startTransition] = useTransition();
  const nomeTipo = new Map(tiposAcao.map((t) => [t.id, t.nome]));

  const daArea = modelos.filter((m) => m.area === area);
  const removidas = daArea.filter((m) => !m.ativo);

  function acao(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok?: string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  function nova(nivel: 1 | 2, fase: FaseTarefa) {
    setEditando({
      area,
      nivel,
      fase,
      titulo: "",
      detalhamento: "",
      unidade: nivel === 1 ? "PROJETO" : "ACAO",
      prazoBase:
        nivel === 1
          ? fase === "ENCERRAMENTO" || fase === "FLUXO_CONTINUO"
            ? "FIM_EXECUCAO"
            : "INICIO_EXECUCAO"
          : fase === "DEPOIS"
            ? "FIM_ACAO"
            : "INICIO_ACAO",
      prazoDias: 0,
      tiposAcao: [],
    });
  }

  function Linha({ m, primeira, ultima }: { m: ModeloDTO; primeira: boolean; ultima: boolean }) {
    return (
      <li className="flex flex-wrap items-start justify-between gap-2 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-brand-deep">{m.titulo}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Prazo {regraLabel(m.prazoBase, m.prazoDias)}
          </div>
          {m.nivel === 2 ? (
            <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {m.unidade === "CIDADE" ? "Uma por cidade" : "Uma por execução da ação"}
              </span>
              {m.tiposAcao.length ? (
                <span className="rounded-full border border-brand/15 bg-brand-mist/60 px-2 py-0.5 font-medium text-brand-deep">
                  Só {m.tiposAcao.map((t) => nomeTipo.get(t) ?? t).join(", ")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {pode ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={pending || primeira} onClick={() => acao(() => moverModeloAction(m.id, -1))}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Descer" disabled={pending || ultima} onClick={() => acao(() => moverModeloAction(m.id, 1))}>
              <ArrowDown className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditando({ ...m })}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Tirar da pré-definição"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Tirar "${m.titulo}" da pré-definição? Projetos novos não terão esta tarefa.`)) {
                  acao(() => setModeloAtivoAction(m.id, false), "Tarefa tirada da pré-definição");
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ) : null}
      </li>
    );
  }

  function Fase({ nivel, fase }: { nivel: 1 | 2; fase: FaseTarefa }) {
    const ts = daArea.filter((m) => m.ativo && m.nivel === nivel && m.fase === fase).sort((a, b) => a.ordem - b.ordem);
    return (
      <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-brand-deep">
            {FASE_LABEL[fase]} <span className="text-xs font-normal text-muted-foreground">· {ts.length}</span>
          </h3>
          {pode ? (
            <Button variant="outline" size="sm" onClick={() => nova(nivel, fase)}>
              <Plus className="size-4" /> Tarefa
            </Button>
          ) : null}
        </div>
        {ts.length ? (
          <ul className="mt-1 divide-y divide-border/50">
            {ts.map((m, i) => (
              <Linha key={m.id} m={m} primeira={i === 0} ultima={i === ts.length - 1} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Nenhuma tarefa nesta fase.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/dashboard/acompanhamento" className="text-xs text-muted-foreground hover:text-brand-deep">
          ← Acompanhamento
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configurações</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">Pré-definição das tarefas</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          As tarefas que todo projeto recebe, com a fase e o prazo em notação D (ex.: D+15, D−3). No nível 1 o D é o
          início ou o fim da execução do projeto; no nível 2, o início ou o fim da execução da ação. Vale para <strong className="font-semibold text-foreground">projetos novos</strong>: quem já começou
          continua com a pré-definição do dia em que entrou no acompanhamento.
        </p>
        {!pode ? <p className="text-sm text-muted-foreground">Só consulta: quem altera é a gestão do acompanhamento.</p> : null}
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-white p-1 text-sm" aria-label="Áreas">
        {(["COMUNICACAO", "PRODUCAO"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setArea(a)}
            aria-current={area === a ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium transition",
              area === a ? "bg-brand-deep text-white" : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {AREA_LABEL[a]}
          </button>
        ))}
      </nav>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">Nível 1 · Projeto</h2>
          <p className="text-sm text-muted-foreground">Uma vez por projeto. Prazo a partir do início ou do fim da execução do projeto.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {FASES_NIVEL1.map((f) => (
            <Fase key={f} nivel={1} fase={f} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">Nível 2 · Ações e cidades</h2>
          <p className="text-sm text-muted-foreground">
            Para cada execução da ação na agenda (ou cada cidade). Prazo a partir do início ou do fim da execução da ação.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {FASES_NIVEL2.map((f) => (
            <Fase key={f} nivel={2} fase={f} />
          ))}
        </div>
      </section>

      {removidas.length ? (
        <section className="space-y-2">
          <button type="button" className="text-sm font-medium text-teal-800 hover:underline" onClick={() => setVerRemovidas((v) => !v)}>
            {verRemovidas ? "Esconder" : "Ver"} {removidas.length} tarefa(s) tirada(s) da pré-definição
          </button>
          {verRemovidas ? (
            <ul className="divide-y divide-border/50 rounded-2xl border border-border/70 bg-white px-4 shadow-sm">
              {removidas.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <span className="text-muted-foreground line-through">{m.titulo}</span>
                    <span className="text-xs text-muted-foreground"> · Nível {m.nivel} · {FASE_LABEL[m.fase]}</span>
                  </span>
                  {pode ? (
                    <Button variant="outline" size="sm" disabled={pending} onClick={() => acao(() => setModeloAtivoAction(m.id, true), "Tarefa devolvida")}>
                      <RotateCcw className="size-4" /> Devolver
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {editando ? (
        <ModeloDialog
          inicial={editando}
          tiposAcao={tiposAcao}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** Data da tarefa em notação D: "D" + dias (negativo = antes) relativo a uma data de referência. */
function RegraCampo({
  titulo,
  nivel,
  base,
  dias,
  onChange,
}: {
  titulo: string;
  nivel: number;
  base: PrazoBase | null;
  dias: number | null;
  onChange: (base: PrazoBase | null, dias: number | null) => void;
}) {
  const tem = base != null && dias != null;
  const ref: PrazoBase = base ?? (nivel === 1 ? "INICIO_EXECUCAO" : "INICIO_ACAO");
  const [texto, setTexto] = useState(tem ? String(dias) : "0");

  return (
    <fieldset className="space-y-1.5">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-medium">{titulo}</legend>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5"
            checked={!tem}
            onChange={(e) => (e.target.checked ? onChange(null, null) : onChange(ref, Number(texto) || 0))}
          />
          Sem prazo
        </label>
      </div>
      {tem ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-brand-deep">D</span>
            <Input
              inputMode="numeric"
              value={texto}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d+−-]/g, "").replace("−", "-");
                setTexto(v);
                const n = Number(v.replace("+", ""));
                if (v !== "" && v !== "-" && v !== "+" && Number.isFinite(n)) onChange(ref, Math.trunc(n));
              }}
              className="w-20 text-center"
              aria-label={`${titulo}: dias em relação ao D`}
            />
            <span className="text-muted-foreground">relativo a</span>
            <select
              className={SELECT}
              value={ref}
              aria-label={`${titulo}: o D é relativo a`}
              onChange={(e) => onChange(e.target.value as PrazoBase, dias)}
            >
              {nivel === 1 ? (
                <>
                  <option value="INICIO_EXECUCAO">início da execução do projeto</option>
                  <option value="FIM_EXECUCAO">fim da execução do projeto</option>
                </>
              ) : (
                <>
                  <option value="INICIO_ACAO">início da execução da ação</option>
                  <option value="FIM_ACAO">fim da execução da ação</option>
                </>
              )}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {notacaoD(dias)}: {dias === 0 ? "no próprio dia" : `${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"} ${dias < 0 ? "antes" : "depois"}`}
            {" "}do {BASE_LABEL[ref]}.
          </p>
        </>
      ) : null}
    </fieldset>
  );
}

function ModeloDialog({
  inicial,
  tiposAcao,
  onClose,
  onSalvo,
}: {
  inicial: ModeloInput;
  tiposAcao: Tipo[];
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [m, setM] = useState<ModeloInput>(inicial);
  const [pending, startTransition] = useTransition();
  const set = (p: Partial<ModeloInput>) => setM((x) => ({ ...x, ...p }));

  function salvar() {
    startTransition(async () => {
      const r = await salvarModeloAction(m);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Pré-definição salva. Vale para projetos novos.");
      onSalvo();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            {AREA_LABEL[m.area]} · Nível {m.nivel}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={m.titulo} onChange={(e) => set({ titulo: e.target.value })} autoFocus={!m.id} />
          </div>
          <div className="space-y-1.5">
            <Label>Detalhamento</Label>
            <Textarea rows={3} value={m.detalhamento} onChange={(e) => set({ detalhamento: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Fase</Label>
            <select className={cn(SELECT, "w-full")} value={m.fase} onChange={(e) => set({ fase: e.target.value as FaseTarefa })}>
              {(m.nivel === 1 ? FASES_NIVEL1 : FASES_NIVEL2).map((f) => (
                <option key={f} value={f}>
                  {FASE_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
          {m.nivel === 2 ? (
            <>
              <div className="space-y-1.5">
                <Label>Quantas vezes</Label>
                <select
                  className={cn(SELECT, "w-full")}
                  value={m.unidade}
                  onChange={(e) => set({ unidade: e.target.value as ModeloInput["unidade"] })}
                >
                  <option value="ACAO">Uma por execução da ação (cada item da agenda)</option>
                  <option value="CIDADE">Uma por cidade (mesmo que receba várias ações)</option>
                </select>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Tipos de ação</legend>
                <p className="text-xs text-muted-foreground">Nenhum marcado = vale para todos os tipos.</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {tiposAcao.map((t) => (
                    <label key={t.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={m.tiposAcao.includes(t.id)}
                        onChange={(e) =>
                          set({ tiposAcao: e.target.checked ? [...m.tiposAcao, t.id] : m.tiposAcao.filter((x) => x !== t.id) })
                        }
                      />
                      {t.nome}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <RegraCampo
              titulo="Prazo"
              nivel={m.nivel}
              base={m.prazoBase}
              dias={m.prazoDias}
              onChange={(prazoBase, prazoDias) => set({ prazoBase, prazoDias })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || !m.titulo.trim()} onClick={salvar}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
