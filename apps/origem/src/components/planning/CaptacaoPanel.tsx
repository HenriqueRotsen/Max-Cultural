"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  refreshPlanningCaptacaoFromSalic,
} from "@/lib/planning/federal/actions";
import {
  updatePlanningCaptacao,
  type ActionState,
} from "@/lib/planning/actions";
import { FieldHelp, FieldLabel } from "@/components/FieldHelp";
import { HELP } from "@/lib/help";

const initial: ActionState = {};

function moneyInput(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "";
  return String(v);
}

function formatMoney(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CaptacaoPanel({
  planningProjectId,
  valorCaptado,
  captadoRecebido,
  captadoTransferido,
  rendimentos,
  pctCaptadoT,
  operableBase,
  isFederal = true,
  defaultOpen = false,
}: {
  planningProjectId: string;
  valorCaptado: number;
  captadoRecebido: number | null;
  captadoTransferido: number | null;
  rendimentos: number | null;
  pctCaptadoT: number;
  operableBase: number;
  isFederal?: boolean;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const saveAction = updatePlanningCaptacao.bind(null, planningProjectId);
  const [saveState, saveFormAction, savePending] = useActionState(
    saveAction,
    initial,
  );
  const [refreshPending, startRefresh] = useTransition();
  const [refreshState, setRefreshState] = useState<ActionState>({});

  return (
    <details className="card group" open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--navy)]">
          Captação operacional
          <FieldHelp text={HELP.planningCaptacao} />
        </span>
        <span className="text-sm tabular-nums text-[var(--gray-500)]">
          Base {formatMoney(operableBase)} ·{" "}
          {(pctCaptadoT * 100).toLocaleString("pt-BR", {
            maximumFractionDigits: 1,
          })}
          % do aprovado
        </span>
      </summary>
      <div className="space-y-3 border-t border-[var(--border)] px-5 pb-5 pt-4">
        {saveState.error || refreshState.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {saveState.error || refreshState.error}
          </p>
        ) : null}
        {saveState.ok || refreshState.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {refreshState.ok
              ? "Captação atualizada do SALIC."
              : isFederal
                ? "Rendimentos salvos."
                : "Captação salva."}
          </p>
        ) : null}
        <form action={saveFormAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="field">
            <FieldLabel htmlFor="valorCaptado" help={HELP.valorCaptado}>
              Valor captado
            </FieldLabel>
            {isFederal ? (
              <input className="w-full" value={formatMoney(valorCaptado)} readOnly disabled />
            ) : (
              <input
                id="valorCaptado"
                name="valorCaptado"
                className="w-full"
                defaultValue={moneyInput(valorCaptado)}
                placeholder="0,00"
              />
            )}
          </div>
          <div className="field">
            <FieldLabel
              htmlFor="captadoRecebido"
              help={
                isFederal
                  ? "Recursos recebidos de outros projetos (SALIC — Captação de recursos)."
                  : "Recursos recebidos de outros projetos (informe à mão)."
              }
            >
              Recebido
            </FieldLabel>
            {isFederal ? (
              <input className="w-full" value={formatMoney(captadoRecebido)} readOnly disabled />
            ) : (
              <input
                id="captadoRecebido"
                name="captadoRecebido"
                className="w-full"
                defaultValue={moneyInput(captadoRecebido)}
                placeholder="0,00"
              />
            )}
          </div>
          <div className="field">
            <FieldLabel
              htmlFor="captadoTransferido"
              help={
                isFederal
                  ? "Recursos transferidos para outros projetos (SALIC — Captação de recursos)."
                  : "Recursos transferidos para outros projetos (informe à mão)."
              }
            >
              Transferido
            </FieldLabel>
            {isFederal ? (
              <input className="w-full" value={formatMoney(captadoTransferido)} readOnly disabled />
            ) : (
              <input
                id="captadoTransferido"
                name="captadoTransferido"
                className="w-full"
                defaultValue={moneyInput(captadoTransferido)}
                placeholder="0,00"
              />
            )}
          </div>
            <div className="field">
              <FieldLabel
                htmlFor="rendimentos"
                help="Informe manualmente os rendimentos financeiros da conta do projeto."
              >
                Rendimentos
              </FieldLabel>
              <input
                id="rendimentos"
                name="rendimentos"
                className="w-full"
                defaultValue={moneyInput(rendimentos)}
                placeholder="0,00"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" className="btn" disabled={savePending}>
                {savePending ? "Salvando…" : isFederal ? "Salvar rendimentos" : "Salvar captação"}
              </button>
              {isFederal ? (
                <button
                  type="button"
                  className="btn"
                  disabled={refreshPending}
                  onClick={() => {
                    setRefreshState({});
                    startRefresh(async () => {
                      const res = await refreshPlanningCaptacaoFromSalic(
                        planningProjectId,
                      );
                      setRefreshState(res);
                      if (res.ok) router.refresh();
                    });
                  }}
                >
                  {refreshPending ? "Atualizando…" : "Atualizar do SALIC"}
                </button>
              ) : null}
            </div>
        </form>
      </div>
    </details>
  );
}
