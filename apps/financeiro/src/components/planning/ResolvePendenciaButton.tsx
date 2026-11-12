"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DialogShell } from "@/components/ui/AppDialog";
import { resolveSalicPendencia } from "@/lib/planning/manual-commitment";

/** Marca a pendência como resolvida, com o motivo (fica no log). */
export function ResolvePendenciaButton({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        Marcar como resolvida
      </button>
      <DialogShell open={open} onClose={() => !pending && setOpen(false)} labelledBy={`resolve-${recordId}`}>
        <div className="space-y-3 px-5 py-5">
          <h2 id={`resolve-${recordId}`} className="text-base font-semibold text-[var(--navy)]">
            Marcar como resolvida?
          </h2>
          <p className="text-sm text-[var(--gray-600)]">
            O lançamento continua no sistema. Diga por quê (fica registrado com o seu nome).
          </p>
          <label className="field">
            <span>Motivo</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setOpen(false)}>
              Voltar
            </button>
            <button
              type="button"
              className="btn"
              disabled={pending || reason.trim().length < 5}
              onClick={() =>
                start(async () => {
                  const res = await resolveSalicPendencia(recordId, reason);
                  if (res.error) return setError(res.error);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? "Salvando…" : "Marcar como resolvida"}
            </button>
          </div>
        </div>
      </DialogShell>
    </>
  );
}
