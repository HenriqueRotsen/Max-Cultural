"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
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
import { SimpleSelect } from "@/components/ui/simple-select";
import { AbasArea, TarefasPorFase } from "@/components/acompanhamento/tarefas-por-fase";
import { moverModeloAction, salvarModeloAction, setModeloAtivoAction, type ModeloInput } from "@/app/actions/predefinicao";
import {
  AREA_LABEL,
  FASE_LABEL,
  FASES_NIVEL1,
  FASES_NIVEL2,
  BASE_LABEL,
  notacaoD,
  type AreaTarefa,
  type FaseTarefa,
  type ModeloDTO,
  type PrazoBase,
} from "@/lib/acompanhamento/types";
import { useConfirm } from "@/components/ui/confirm";

type Tipo = { id: string; nome: string };

export function PreDefinicaoEditor({ modelos, tiposAcao, pode }: { modelos: ModeloDTO[]; tiposAcao: Tipo[]; pode: boolean }) {
  const router = useRouter();
  const confirmar = useConfirm();
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

  const itens = daArea
    .filter((m) => m.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((m) => ({ ...m, tiposNomes: m.tiposAcao.map((t) => nomeTipo.get(t) ?? t) }));
  const porId = new Map(modelos.map((m) => [m.id, m]));

  function acoesDaLinha(m: ModeloDTO) {
    if (!pode) return null;
    return (
      <>
        <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditando({ ...porId.get(m.id)! })}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Tirar da pré-definição"
          disabled={pending}
          onClick={async () => {
            const ok = await confirmar({
              title: `Tirar "${m.titulo}" da pré-definição?`,
              description: "Projetos novos não terão esta tarefa. Projetos que já começaram continuam com ela, e dá para devolver depois.",
              confirmLabel: "Tirar da pré-definição",
              destructive: true,
            });
            if (ok) acao(() => setModeloAtivoAction(m.id, false), "Tarefa tirada da pré-definição");
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </>
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

      <AbasArea area={area} onChange={setArea} />

      <TarefasPorFase
        itens={itens}
        acoes={pode ? acoesDaLinha : undefined}
        onNova={pode ? nova : undefined}
        onMover={pode ? (id, para) => acao(() => moverModeloAction(id, para)) : undefined}
        disabled={pending}
      />

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
export function RegraCampo({
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
            <SimpleSelect
              value={ref}
              aria-label={`${titulo}: o D é relativo a`}
              className="h-9"
              onChange={(v) => onChange(v as PrazoBase, dias)}
              options={
                nivel === 1
                  ? [
                      { value: "INICIO_EXECUCAO", label: "início da execução do projeto" },
                      { value: "FIM_EXECUCAO", label: "fim da execução do projeto" },
                    ]
                  : [
                      { value: "INICIO_ACAO", label: "início da execução da ação" },
                      { value: "FIM_ACAO", label: "fim da execução da ação" },
                    ]
              }
            />
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
            <SimpleSelect
              value={m.fase}
              aria-label="Fase"
              className="h-9 w-full"
              onChange={(v) => set({ fase: v as FaseTarefa })}
              options={(m.nivel === 1 ? FASES_NIVEL1 : FASES_NIVEL2).map((f) => ({ value: f, label: FASE_LABEL[f] }))}
            />
          </div>
          {m.nivel === 2 ? (
            <>
              <div className="space-y-1.5">
                <Label>Quantas vezes</Label>
                <SimpleSelect
                  value={m.unidade}
                  aria-label="Quantas vezes"
                  className="h-9 w-full"
                  onChange={(v) => set({ unidade: v as ModeloInput["unidade"] })}
                  options={[
                    { value: "ACAO", label: "Uma por execução da ação (cada item da agenda)" },
                    { value: "CIDADE", label: "Uma por cidade (mesmo que receba várias ações)" },
                  ]}
                />
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
