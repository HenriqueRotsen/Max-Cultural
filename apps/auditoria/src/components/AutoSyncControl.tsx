"use client";

import { useActionState, useState } from "react";
import { setSalicAutoSync } from "@/lib/sync/auto-sync";
import {
  AUTO_SYNC_CONFIRM_WORD,
  type AutoSyncState,
} from "@/lib/sync/auto-sync-shared";

export type AutoSyncInfo = {
  enabled: boolean;
  changedAt: string | null;
  changedBy: string | null;
  note: string | null;
};

const initial: AutoSyncState = {};

/**
 * Desligar a atualização automática: só para quem tem a capacidade no Controle de
 * acesso, em duas etapas (aviso → digitar a palavra + motivo). Religar é um clique.
 */
export function AutoSyncControl({ autoSync }: { autoSync: AutoSyncInfo }) {
  const [state, action, pending] = useActionState(setSalicAutoSync, initial);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState("");

  if (!autoSync.enabled) {
    return (
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="min-w-0 flex-1 basis-[16rem] text-sm text-[var(--gray-600)]">
          A atualização automática está desligada. Ao religar, volta a rodar todo dia às 8h.
        </p>
        <form action={action}>
          <input type="hidden" name="enable" value="1" />
          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Religando…" : "Religar atualização automática"}
          </button>
        </form>
        {state.error ? <p className="w-full text-sm text-red-700">{state.error}</p> : null}
      </section>
    );
  }

  return (
    <section className="card space-y-3 border-[#fecaca] p-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--navy)]">Desativar atualização automática</h2>
        <p className="mt-1 text-[0.95rem] text-[var(--gray-600)]">
          Só para casos excepcionais. Com ela desligada, os dados do SALIC deixam de ser
          atualizados sozinhos e os alertas de diligência param de chegar.
        </p>
      </div>

      {step === 0 ? (
        <button type="button" className="btn btn-ghost text-red-700" onClick={() => setStep(1)}>
          Desativar…
        </button>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#991b1b]">
          <p className="font-semibold">Tem certeza?</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Os projetos e pagamentos ficam parados na última atualização.</li>
            <li>Diligências novas no SALIC não geram alerta.</li>
            <li>Vale para todos os proponentes deste workspace.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn bg-[#b91c1c] text-white hover:bg-[#991b1b]"
              onClick={() => setStep(2)}
            >
              Continuar
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <form action={action} className="space-y-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4">
          <input type="hidden" name="enable" value="0" />
          <label className="field">
            <span>Motivo</span>
            <input name="note" required maxLength={500} placeholder="Ex.: manutenção no SALIC" />
          </label>
          <label className="field">
            <span>
              Digite <strong>{AUTO_SYNC_CONFIRM_WORD}</strong> para confirmar
            </span>
            <input
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
            />
          </label>
          {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setStep(0);
                setTyped("");
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn bg-[#b91c1c] text-white hover:bg-[#991b1b]"
              disabled={pending || typed.trim().toUpperCase() !== AUTO_SYNC_CONFIRM_WORD}
            >
              {pending ? "Desativando…" : "Desativar atualização automática"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
