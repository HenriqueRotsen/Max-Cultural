"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortableList } from "@/components/ui/sortable-list";
import { cn } from "@/lib/utils";
import {
  AREA_LABEL,
  FASE_LABEL,
  FASES_NIVEL1,
  FASES_NIVEL2,
  regraLabel,
  type AreaTarefa,
  type FaseTarefa,
  type PrazoBase,
  type UnidadeTarefa,
} from "@/lib/acompanhamento/types";

/** Tarefa como aparece na pré-definição (geral ou a do projeto). */
export type ItemTarefa = {
  id: string;
  nivel: number;
  fase: FaseTarefa;
  titulo: string;
  prazoBase: PrazoBase | null;
  prazoDias: number | null;
  unidade: UnidadeTarefa;
  /** Nomes dos tipos de ação (vazio = todos). */
  tiposNomes: string[];
};

/** Abas Comunicação / Produção, iguais na pré-definição e no projeto. */
export function AbasArea({ area, onChange }: { area: AreaTarefa; onChange: (a: AreaTarefa) => void }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-white p-1 text-sm" aria-label="Áreas">
      {(["COMUNICACAO", "PRODUCAO"] as const).map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
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
  );
}

/**
 * Tarefas da área em Nível 1 (projeto) e Nível 2 (ações e cidades), por fase.
 * Mesma tela na pré-definição geral e nos prazos de cada projeto; muda só o
 * que cada linha permite fazer (`acoes`) e o que mostra a mais (`extra`).
 */
export function TarefasPorFase<T extends ItemTarefa>({
  itens,
  acoes,
  extra,
  onNova,
  onMover,
  disabled,
}: {
  /** Tarefas ativas da área, na ordem. */
  itens: T[];
  acoes?: (t: T) => ReactNode;
  extra?: (t: T) => ReactNode;
  /** Mostra "+ Tarefa" em cada fase. */
  onNova?: (nivel: 1 | 2, fase: FaseTarefa) => void;
  /** Permite arrastar para ordenar dentro da fase. */
  onMover?: (id: string, para: number) => void;
  disabled?: boolean;
}) {
  function linha(t: T, alca: ReactNode) {
    return (
      <div className="flex items-start gap-1.5 py-2.5">
        {alca}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-brand-deep">{t.titulo}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Prazo {regraLabel(t.prazoBase, t.prazoDias)}</div>
          {t.nivel === 2 ? (
            <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {t.unidade === "CIDADE" ? "Uma por cidade" : "Uma por execução da ação"}
              </span>
              {t.tiposNomes.length ? (
                <span className="rounded-full border border-brand/15 bg-brand-mist/60 px-2 py-0.5 font-medium text-brand-deep">
                  Só {t.tiposNomes.join(", ")}
                </span>
              ) : null}
            </div>
          ) : null}
          {extra?.(t)}
        </div>
        {acoes ? <div className="flex shrink-0 items-center gap-0.5">{acoes(t)}</div> : null}
      </div>
    );
  }

  function Fase({ nivel, fase }: { nivel: 1 | 2; fase: FaseTarefa }) {
    const ts = itens.filter((t) => t.nivel === nivel && t.fase === fase);
    return (
      <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-brand-deep">
            {FASE_LABEL[fase]} <span className="text-xs font-normal text-muted-foreground">· {ts.length}</span>
          </h3>
          {onNova ? (
            <Button variant="outline" size="sm" onClick={() => onNova(nivel, fase)}>
              <Plus className="size-4" /> Tarefa
            </Button>
          ) : null}
        </div>
        {!ts.length ? (
          <p className="mt-2 text-xs text-muted-foreground">Nenhuma tarefa nesta fase.</p>
        ) : onMover ? (
          <SortableList
            itens={ts}
            disabled={disabled}
            className="mt-1 divide-y divide-border/50"
            rotulo={(t) => t.titulo}
            onMover={onMover}
          >
            {(t, { alca }) => linha(t, alca)}
          </SortableList>
        ) : (
          <ul className="mt-1 divide-y divide-border/50">
            {ts.map((t) => (
              <li key={t.id}>{linha(t, null)}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <>
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
    </>
  );
}
