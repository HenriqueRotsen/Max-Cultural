"use client";

import { useActionState, useState } from "react";
import { ProjectCapsFields } from "@/components/planning/ProjectCapsFields";
import { updateProjectCaps } from "@/lib/planning/project-actions";
import type { ActionState } from "@/lib/planning/action-state";
import type { ProjectCaps } from "@/lib/planning/project-caps";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Limites do projeto (no lugar da IN): leitura para todos, edição com permissão. */
export function ProjectCapsPanel({
  projectId,
  caps,
  rulesetLabel,
  canEdit,
}: {
  projectId: string;
  caps: ProjectCaps;
  rulesetLabel: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const r = await updateProjectCaps(projectId, prev, fd);
    if (r.ok) setEditing(false);
    return r;
  }, {});

  return (
    <section className="card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-[var(--navy)]">Limites do projeto</h2>
        {canEdit && !editing ? (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
            Ajustar
          </button>
        ) : null}
      </div>
      {editing ? (
        <form action={action} className="space-y-3">
          <ProjectCapsFields initial={caps} />
          {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="btn" disabled={pending}>
              {pending ? "Salvando…" : "Salvar limites"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-[var(--gray-500)]">Mesmo fornecedor</dt>
            <dd className="font-semibold text-[var(--navy)]">{pct(caps.supplierCapPct)} do captado</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--gray-500)]">Proponente + vínculo</dt>
            <dd className="font-semibold text-[var(--navy)]">{pct(caps.bondCapPct)} do captado</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--gray-500)]">Exceder a rubrica</dt>
            <dd className="font-semibold text-[var(--navy)]">até {pct(caps.rubricOverrunPct)} acima</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--gray-500)]">IN (informativo)</dt>
            <dd className="font-semibold text-[var(--navy)]">{rulesetLabel || "—"}</dd>
          </div>
        </dl>
      )}
      {state.ok && !editing ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
    </section>
  );
}
