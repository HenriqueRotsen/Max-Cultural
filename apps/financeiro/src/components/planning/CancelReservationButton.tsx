"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DialogShell } from "@/components/ui/AppDialog";
import { cancelReservationWithoutNf } from "@/lib/planning/manual-commitment";

/** Cancela uma reserva sem NF, pedindo o motivo (fica registrado no log). */
export function CancelReservationButton({
  commitmentId,
  redirectTo,
}: {
  commitmentId: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        Cancelar reserva
      </button>
      <DialogShell open={open} onClose={close} labelledBy="cancel-reservation-title">
        <div className="space-y-3 px-5 py-5">
          <h2 id="cancel-reservation-title" className="text-base font-semibold text-[var(--navy)]">
            Cancelar esta reserva?
          </h2>
          <p className="text-sm leading-relaxed text-[var(--gray-600)]">
            O valor volta ao saldo da rubrica e sai da conta dos limites do projeto. O
            cancelamento fica registrado com o seu nome e o motivo.
          </p>
          <label className="field">
            <span>Motivo</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: serviço não será mais contratado"
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={close}>
              Voltar
            </button>
            <button
              type="button"
              className="btn bg-red-700 hover:bg-red-800"
              disabled={pending || reason.trim().length < 5}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await cancelReservationWithoutNf(commitmentId, reason);
                  if (res.error) {
                    setError(res.error);
                    return;
                  }
                  setOpen(false);
                  router.push(redirectTo);
                  router.refresh();
                })
              }
            >
              {pending ? "Cancelando…" : "Cancelar reserva"}
            </button>
          </div>
        </div>
      </DialogShell>
    </>
  );
}
