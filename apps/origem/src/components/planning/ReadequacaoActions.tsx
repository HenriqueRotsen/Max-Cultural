"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/AppDialog";
import { startReadequacaoDraft } from "@/lib/planning/actions";

export function ReadequacaoActions({
  planningProjectId,
  openDraftId,
  expiresAt,
  menuItem = false,
  onAction,
}: {
  planningProjectId: string;
  openDraftId: string | null;
  expiresAt: string | null;
  /** @deprecated Mantido por compat; sync diário cobre a planilha SALIC. */
  isFederal?: boolean;
  menuItem?: boolean;
  onAction?: () => void;
}) {
  const [pending, start] = useTransition();
  const [alert, setAlert] = useState<{ title: string; description: string } | null>(
    null,
  );
  const router = useRouter();

  const btnClass = menuItem
    ? "w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)] disabled:opacity-50"
    : "btn btn-ghost";

  return (
    <>
      <div className={menuItem ? "flex flex-col gap-0.5" : "flex flex-wrap items-center gap-2"}>
        {openDraftId ? (
          <button
            type="button"
            className={btnClass}
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              onAction?.();
              router.push(`/planejamento/${planningProjectId}/readequacao/${openDraftId}`);
            }}
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
            onClick={(e) => {
              e.stopPropagation();
              onAction?.();
              start(async () => {
                try {
                  await startReadequacaoDraft(planningProjectId);
                  router.refresh();
                } catch (err) {
                  setAlert({
                    title: "Não foi possível abrir o rascunho",
                    description:
                      err instanceof Error ? err.message : "Tente novamente.",
                  });
                }
              });
            }}
          >
            Montar planilha
          </button>
        )}
      </div>

      <AlertDialog
        open={Boolean(alert)}
        title={alert?.title ?? ""}
        description={alert?.description ?? ""}
        tone="error"
        onClose={() => setAlert(null)}
      />
    </>
  );
}
