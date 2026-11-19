"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const GENERIC = "Não foi possível gerar o relatório agora. Tente de novo em alguns minutos.";

/** Mensagem do servidor só quando é texto para o usuário, não erro técnico. */
function friendly(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return GENERIC;
  if (/page\.|Target|browser|Error|Call log|undefined|prisma|ECONN|timeout/i.test(raw)) return GENERIC;
  return raw;
}

/**
 * Gera o PDF sem sair da tela: baixa o arquivo quando fica pronto e, se der
 * errado, mostra uma mensagem em vez de abrir uma página com o erro.
 */
export function useReportDownload() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(href: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(href, { credentials: "same-origin" });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.includes("pdf")) {
        let msg = GENERIC;
        if (res.status === 504) {
          msg = "O relatório demorou demais para ficar pronto. Tente com menos PRONACs.";
        } else if (type.includes("json")) {
          msg = friendly((await res.json().catch(() => null))?.error);
        }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "relatorio.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Sem conexão com o servidor. Confira a internet e tente de novo.");
    } finally {
      setPending(false);
    }
  }

  const dialog = error ? <ReportErrorDialog message={error} onClose={() => setError(null)} /> : null;
  return { download, pending, dialog };
}

function ReportErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="report-error-title"
        aria-describedby="report-error-text"
        className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="report-error-title" className="text-base font-semibold text-[var(--navy)]">
          Relatório não gerado
        </h2>
        <p id="report-error-text" className="text-sm text-[var(--gray-600)]">
          {message}
        </p>
        <div className="flex justify-end">
          <button type="button" className="btn" onClick={onClose} autoFocus>
            Entendi
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
