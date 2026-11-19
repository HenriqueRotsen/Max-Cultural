"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * "Gerar relatório PDF" da aba Por PRONAC: pergunta o tipo antes de gerar.
 * - Limites por PRONAC: o relatório de sempre (limites, fornecedores, pagamentos).
 * - Situação no SALIC: tabela de projetos e situação, com a busca da tela.
 */
export function ReportChooserButton({ limitsHref }: { limitsHref: string }) {
  const [open, setOpen] = useState(false);
  // A busca da tabela é gravada no endereço sem recarregar: lê na hora do clique.
  const [params, setParams] = useState({ q: "", accountId: "" });
  const { q, accountId } = params;
  function openChooser() {
    const sp = new URLSearchParams(window.location.search);
    setParams({ q: (sp.get("q") || "").trim(), accountId: sp.get("accountId") || "" });
    setOpen(true);
  }

  const situacaoQs = new URLSearchParams();
  if (q) situacaoQs.set("q", q);
  if (accountId) situacaoQs.set("accountId", accountId);
  const situacaoHref = `/api/reports/situacao${situacaoQs.size ? `?${situacaoQs}` : ""}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const option = (href: string, title: string, text: string, extra?: string) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => setOpen(false)}
      className="block rounded-xl border border-[var(--border)] p-4 transition hover:border-[var(--navy)] hover:bg-[var(--navy-soft)]"
    >
      <span className="block font-semibold text-[var(--navy)]">{title}</span>
      <span className="mt-1 block text-sm text-[var(--gray-600)]">{text}</span>
      {extra ? <span className="mt-1 block text-xs text-[var(--gray-500)]">{extra}</span> : null}
    </a>
  );

  return (
    <>
      <button type="button" className="btn btn-gold" onClick={openChooser}>
        Gerar relatório PDF
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="report-chooser-title"
                className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="report-chooser-title" className="text-base font-semibold text-[var(--navy)]">
                  Qual relatório?
                </h2>
                {option(
                  limitsHref,
                  "Limites por PRONAC",
                  "Limites da IN, fornecedores e pagamentos de cada projeto.",
                  "Usa o proponente, o período e os observados escolhidos.",
                )}
                {option(
                  situacaoHref,
                  "Situação no SALIC",
                  "Tabela com cada projeto e a situação dele no SALIC, com a data em que foi gerado.",
                  q ? `Só os projetos da busca “${q}”.` : "Todos os projetos (inclusive os ainda sem pagamento).",
                )}
                <div className="flex justify-end">
                  <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
