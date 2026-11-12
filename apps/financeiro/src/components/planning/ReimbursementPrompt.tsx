"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { DialogShell } from "@/components/ui/AppDialog";

/**
 * Pergunta "Este valor é um reembolso?" da NF/RPA e do pagamento antecipado.
 * - Ao clicar no botão de envio sem ter respondido, abre uma janela com Sim/Não;
 *   o formulário só é enviado depois da resposta.
 * - A resposta fica visível no fim do formulário (`control`), onde pode ser
 *   trocada se a pessoa clicou errado.
 * Vai no campo oculto `isReimbursement` ("true" | "false"). Reembolso não entra
 * na soma do vínculo com o proponente — a mesma regra da chave "Conta p/ vínculo"
 * da Auditoria, aplicada já no planejamento.
 *
 * Uso: `const r = useReimbursementPrompt();` e, no formulário,
 * `<form onSubmit={r.onSubmit} …>{r.field}…{r.control}…</form>{r.dialog}`.
 */
export function useReimbursementPrompt() {
  const [value, setValue] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      if (value !== null) return;
      e.preventDefault();
      formRef.current = e.currentTarget;
      setOpen(true);
    },
    [value],
  );

  const answer = useCallback((isReimbursement: boolean) => {
    // Grava a resposta antes de reenviar, para o campo oculto já sair preenchido.
    flushSync(() => {
      setValue(isReimbursement);
      setOpen(false);
    });
    formRef.current?.requestSubmit();
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const field = (
    <input type="hidden" name="isReimbursement" value={value === null ? "" : String(value)} />
  );

  const option = (v: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={value === v}
      onClick={() => setValue(v)}
      className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${
        value === v
          ? "border-[var(--navy)] bg-[var(--navy)] text-white"
          : "border-[var(--border)] bg-white text-[var(--navy)] hover:border-[var(--navy)]"
      }`}
    >
      {label}
    </button>
  );

  const control = (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--gold)_35%,var(--border))] bg-[var(--gold-soft)] px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="font-medium text-[var(--navy)]">Este valor é um reembolso?</span>
          <span className="mt-0.5 block text-[var(--gray-500)]">
            {value === null
              ? "Será perguntado ao enviar. Reembolso de despesa não entra na soma do vínculo com o proponente."
              : "Reembolso de despesa não entra na soma do vínculo com o proponente. Clicou errado? Troque aqui."}
          </span>
        </span>
        <span className="flex gap-2" role="group" aria-label="Este valor é um reembolso?">
          {option(true, "Sim")}
          {option(false, "Não")}
        </span>
      </div>
    </div>
  );

  const dialog = (
    <DialogShell open={open} onClose={close} labelledBy="reimbursement-title">
      <div className="px-5 py-5">
        <h2 id="reimbursement-title" className="text-base font-semibold text-[var(--navy)]">
          Este valor é um reembolso?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--gray-600)]">
          Reembolso de despesa não entra na soma do vínculo com o proponente.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Voltar
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => answer(false)}>
            Não
          </button>
          <button type="button" className="btn" onClick={() => answer(true)}>
            Sim, é reembolso
          </button>
        </div>
      </div>
    </DialogShell>
  );

  return { onSubmit, field, control, dialog };
}
