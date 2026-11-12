"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DialogShell } from "@/components/ui/AppDialog";
import { formatCurrency } from "@/lib/format";
import { deletePaidPayment } from "@/lib/planning/delete-paid-payment";

/**
 * Exclui um pagamento com comprovante em duas etapas: 1) o que vai sair e o
 * motivo; 2) digitar EXCLUIR. Se o comprovante foi enviado ao SALIC, sai de lá
 * também.
 */
export function DeletePaidPaymentButton({
  commitmentId,
  supplierName,
  amount,
  rubricCount,
  inSalic,
  redirectTo,
}: {
  commitmentId: string;
  supplierName: string;
  /** Total do pagamento (todas as rubricas do rateio). */
  amount: number;
  rubricCount: number;
  inSalic: boolean;
  redirectTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setStep(1);
    setWord("");
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        Excluir pagamento
      </button>
      <DialogShell open={open} onClose={close} labelledBy="delete-paid-title">
        <div className="space-y-3 px-5 py-5">
          <h2 id="delete-paid-title" className="text-base font-semibold text-red-800">
            {step === 1 ? "Excluir este pagamento?" : "Confirme a exclusão"}
          </h2>
          {step === 1 ? (
            <>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-[var(--gray-600)]">
                <li>
                  Sai o pagamento de {formatCurrency(amount)} a {supplierName}
                  {rubricCount > 1 ? `, nas ${rubricCount} rubricas do rateio` : ""}, com a NF/RPA,
                  o comprovante e as guias.
                </li>
                {inSalic ? (
                  <li className="font-medium text-red-800">
                    O comprovante também será excluído no SALIC.
                  </li>
                ) : null}
                <li>O valor volta ao saldo da rubrica.</li>
                <li>Fica registrado com o seu nome, o motivo e o que foi excluído.</li>
              </ul>
              <label className="field">
                <span>Motivo</span>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: pagamento lançado no projeto errado"
                />
              </label>
            </>
          ) : (
            <label className="field">
              <span>
                Digite <strong>EXCLUIR</strong> para confirmar. Não dá para desfazer pelo sistema.
              </span>
              <input value={word} onChange={(e) => setWord(e.target.value)} autoFocus />
            </label>
          )}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={close}>
              Voltar
            </button>
            {step === 1 ? (
              <button
                type="button"
                className="btn bg-red-700 hover:bg-red-800"
                disabled={reason.trim().length < 10}
                onClick={() => setStep(2)}
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                className="btn bg-red-700 hover:bg-red-800"
                disabled={pending || word.trim().toUpperCase() !== "EXCLUIR"}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const res = await deletePaidPayment(commitmentId, reason, word);
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
                {pending ? (inSalic ? "Excluindo no SALIC…" : "Excluindo…") : "Excluir pagamento"}
              </button>
            )}
          </div>
        </div>
      </DialogShell>
    </>
  );
}
