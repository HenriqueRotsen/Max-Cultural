"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePlanningFiscalDocument } from "@/lib/planning/actions";

export function DeleteNfButton({
  documentId,
  documentKind,
  filename,
  redirectTo,
}: {
  documentId: string;
  documentKind: "NF" | "RPA" | string;
  filename?: string | null;
  redirectTo: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
        disabled={pending}
        onClick={() => {
          const label = documentKind === "RPA" ? "RPA" : "NF";
          const ok = window.confirm(
            `Excluir esta ${label}${filename ? ` («${filename}»)` : ""}?\n\nSó é permitido se não houver comprovante de pagamento. Reservas e rateio vinculados serão desfeitos.`,
          );
          if (!ok) return;
          setError(null);
          start(async () => {
            const res = await deletePlanningFiscalDocument(documentId);
            if (res.error) {
              setError(res.error);
              return;
            }
            router.push(redirectTo);
            router.refresh();
          });
        }}
      >
        {pending ? "Excluindo…" : `Excluir ${documentKind === "RPA" ? "RPA" : "NF"}`}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
