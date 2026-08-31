"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, ConfirmDialog } from "@/components/ui/AppDialog";
import { startReadequacaoDraft } from "@/lib/planning/actions";
import { startReadequacaoFromSalic } from "@/lib/planning/federal/actions";

export function ReadequacaoActions({
  planningProjectId,
  openDraftId,
  expiresAt,
  isFederal = true,
  menuItem = false,
  onAction,
}: {
  planningProjectId: string;
  openDraftId: string | null;
  expiresAt: string | null;
  isFederal?: boolean;
  menuItem?: boolean;
  onAction?: () => void;
}) {
  const [pending, start] = useTransition();
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [alert, setAlert] = useState<{ title: string; description: string } | null>(
    null,
  );
  const router = useRouter();

  const btnClass = menuItem
    ? "w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)] disabled:opacity-50"
    : "btn btn-ghost";

  function runImportFromSalic() {
    start(async () => {
      const r = await startReadequacaoFromSalic(planningProjectId);
      setConfirmImportOpen(false);
      if (r?.error) {
        setAlert({ title: "Importação cancelada", description: r.error });
        return;
      }
      router.refresh();
    });
  }

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
                await startReadequacaoDraft(planningProjectId);
                router.refresh();
              });
            }}
          >
            Montar planilha
          </button>
        )}
        {isFederal ? (
          <button
            type="button"
            className={btnClass}
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmImportOpen(true);
            }}
          >
            Importar readequação do SALIC
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmImportOpen}
        title="Importar readequação do SALIC?"
        description={
          <>
            <p>
              A planilha atual deste projeto será substituída pelos valores readequados
              publicados no SALIC.
            </p>
            <p className="mt-2">
              Se a readequação no SALIC estiver vazia (R$ 0,00 aprovados), a importação
              será cancelada e a planilha local permanece intacta.
            </p>
          </>
        }
        confirmLabel="Importar do SALIC"
        cancelLabel="Voltar"
        tone="danger"
        pending={pending}
        onCancel={() => setConfirmImportOpen(false)}
        onConfirm={() => {
          onAction?.();
          runImportFromSalic();
        }}
      />

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
