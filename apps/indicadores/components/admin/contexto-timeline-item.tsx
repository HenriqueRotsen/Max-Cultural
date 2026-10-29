"use client";

import Link from "next/link";
import type { ProgramaEdicao } from "@/app/actions/programa";
import { ProjetoContextEditor } from "@/components/admin/projeto-context-editor";

export function ContextoTimelineItem({
  edicao,
  contextoId,
  contextoNome,
}: {
  edicao: ProgramaEdicao;
  contextoId: string;
  contextoNome: string;
}) {
  return (
    <li className="relative">
      <span className="absolute -left-[1.625rem] top-2 size-3 rounded-full bg-brand ring-4 ring-white" />
      <div className="rounded-2xl border border-brand/10 bg-white/90 px-5 py-4 shadow-sm transition hover:border-brand/30 hover:bg-white">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold tracking-wide text-[var(--gray-400)] uppercase">
              {edicao.numeroEdicao != null
                ? `${edicao.numeroEdicao}ª edição`
                : edicao.ano !== "—"
                  ? edicao.ano
                  : "Edição"}
            </div>
            <Link
              href={edicao.href}
              className="font-heading text-lg font-semibold text-brand-deep underline-offset-2 hover:underline"
            >
              {edicao.Nome_projeto}
            </Link>
            {edicao.canEditContexto ? (
              <ProjetoContextEditor
                compact
                projetoId={edicao.id_projeto}
                contextoId={contextoId}
                contextoNome={contextoNome}
              />
            ) : null}
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {edicao.inscritos} insc. · {edicao.selecionados} sel. ·{" "}
            {edicao.oficinas} ofc.
          </div>
        </div>
      </div>
    </li>
  );
}
