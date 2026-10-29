"use client";

import { useActionState, useEffect, useState } from "react";
import { DialogShell } from "@/components/ui/AppDialog";
import { closePlanningProject } from "@/lib/planning/project-actions";
import type { ActionState } from "@/lib/planning/action-state";

const WAIT_SECONDS = 10;

/**
 * Encerrar projeto com confirmação dupla:
 * 1) resumo do que ainda está em aberto;
 * 2) digitar o código do projeto + 10 s de espera antes do botão final.
 */
export function CloseProjectButton({
  projectId,
  externalCode,
  projectName,
  summary,
}: {
  projectId: string;
  externalCode: string;
  projectName: string;
  summary: { openReservations: number; nfPending: number; evaluationPending: number };
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    closePlanningProject.bind(null, projectId),
    {},
  );

  useEffect(() => {
    if (step !== 2 || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, secondsLeft]);

  const close = () => {
    setStep(0);
    setTyped("");
    setSecondsLeft(WAIT_SECONDS);
  };
  const pendencias = [
    summary.openReservations
      ? `${summary.openReservations} reserva(s) ainda não paga(s)`
      : null,
    summary.nfPending ? `${summary.nfPending} pagamento(s) sem NF` : null,
    summary.evaluationPending
      ? `${summary.evaluationPending} fornecedor(es) sem avaliação`
      : null,
  ].filter(Boolean) as string[];
  const ready = typed.trim() === externalCode && secondsLeft <= 0;

  return (
    <>
      <button type="button" className="btn btn-ghost text-red-700" onClick={() => setStep(1)}>
        Encerrar projeto
      </button>

      <DialogShell open={step === 1} onClose={close} labelledBy="close-step1" role="alertdialog">
        <div className="space-y-4 p-6">
          <h2 id="close-step1" className="text-lg font-semibold text-[var(--navy)]">
            Encerrar {projectName}?
          </h2>
          <p className="text-sm text-[var(--gray-600)]">
            Depois de encerrado, o projeto <strong>some do MAX Financeiro</strong> (listas, buscas e
            contas a pagar) e o sistema para de consultar o SALIC para ele.
          </p>
          {pendencias.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Ainda em aberto:</p>
              <ul className="mt-1 list-disc pl-5">
                {pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-700">Nada em aberto neste projeto.</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Voltar
            </button>
            <button type="button" className="btn" onClick={() => setStep(2)}>
              Continuar
            </button>
          </div>
        </div>
      </DialogShell>

      <DialogShell open={step === 2} onClose={close} labelledBy="close-step2" role="alertdialog">
        <form action={formAction} className="space-y-4 p-6">
          <h2 id="close-step2" className="text-lg font-semibold text-[var(--navy)]">
            Confirmação final
          </h2>
          <label className="block text-sm text-[var(--gray-600)]" htmlFor="confirmCode">
            Digite <strong>{externalCode}</strong> para confirmar o encerramento.
          </label>
          <input
            id="confirmCode"
            name="confirmCode"
            className="field w-full"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <label className="block text-sm text-[var(--gray-600)]" htmlFor="reason">
            Motivo (opcional)
          </label>
          <textarea id="reason" name="reason" rows={2} maxLength={1000} className="field w-full" />
          {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn bg-red-700 text-white hover:bg-red-800 disabled:opacity-60"
              disabled={!ready || pending}
            >
              {pending
                ? "Encerrando…"
                : secondsLeft > 0
                  ? `Aguarde ${secondsLeft}s`
                  : "Encerrar definitivamente"}
            </button>
          </div>
        </form>
      </DialogShell>
    </>
  );
}
