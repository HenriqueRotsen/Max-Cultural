"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startReadequacaoDraft,
  startReadequacaoFromSalic,
} from "@/lib/planning/actions";

export function ReadequacaoActions({
  planningProjectId,
  openDraftId,
  expiresAt,
  menuItem = false,
}: {
  planningProjectId: string;
  openDraftId: string | null;
  expiresAt: string | null;
  menuItem?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const btnClass = menuItem
    ? "w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)] disabled:opacity-50"
    : "btn btn-ghost";

  return (
    <div className={menuItem ? "flex flex-col gap-0.5" : "flex flex-wrap items-center gap-2"}>
      {openDraftId ? (
        <button
          type="button"
          className={btnClass}
          disabled={pending}
          onClick={() =>
            router.push(`/planejamento/${planningProjectId}/readequacao/${openDraftId}`)
          }
        >
          Montar planilha
          {expiresAt
            ? ` (até ${new Date(expiresAt).toLocaleString("pt-BR")})`
            : ""}
        </button>
      ) : (
        <button
          type="button"
          className={btnClass}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await startReadequacaoDraft(planningProjectId);
              router.refresh();
            })
          }
        >
          Montar planilha
        </button>
      )}
      <button
        type="button"
        className={btnClass}
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (
              !window.confirm(
                "Importar a planilha readequada do SALIC e substituir a planilha atual deste projeto?",
              )
            ) {
              return;
            }
            const r = await startReadequacaoFromSalic(planningProjectId);
            if (r?.error) alert(r.error);
            router.refresh();
          })
        }
      >
        Importar readequação do SALIC
      </button>
    </div>
  );
}
