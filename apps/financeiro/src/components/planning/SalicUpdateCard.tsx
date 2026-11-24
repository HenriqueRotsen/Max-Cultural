"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateCommitmentInSalic } from "@/lib/planning/federal/actions";

/**
 * Pagamento com mudança depois de ir ao SALIC (NF, outros documentos, número…)
 * ou com guia de imposto ainda não lançada: um botão apaga o que está lá e
 * lança de novo com os documentos atuais.
 */
export function SalicUpdateCard({
  planningProjectId,
  commitmentId,
  items,
  canPublish,
}: {
  planningProjectId: string;
  commitmentId: string;
  /** O que vai ao SALIC (rótulos da fila). */
  items: string[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; text: string } | null>(null);

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">Atualizar no SALIC</p>
      <p>
        Este pagamento mudou depois de ir ao SALIC, ou tem lançamento novo. Ao atualizar, o que está
        lá é excluído e lançado de novo com os documentos atuais.
      </p>
      <ul className="list-disc pl-5 text-xs">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      {canPublish ? (
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            if (!confirm("Atualizar no SALIC agora? O lançamento atual será excluído e enviado de novo.")) return;
            start(async () => {
              const r = await updateCommitmentInSalic(planningProjectId, commitmentId);
              setResult(r.error ? { text: r.error } : { ok: true, text: r.message ?? "SALIC atualizado." });
              router.refresh();
            });
          }}
        >
          {pending ? "Atualizando no SALIC…" : "Atualizar no SALIC"}
        </button>
      ) : (
        <p className="text-xs">Peça a quem tem permissão de enviar ao SALIC para atualizar.</p>
      )}
      {result ? (
        <p className={result.ok ? "text-emerald-700" : "text-red-700"}>{result.text}</p>
      ) : null}
    </div>
  );
}
