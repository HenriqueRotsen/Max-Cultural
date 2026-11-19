"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncPendingSponsorsAction } from "@/lib/actions";

/** Busca agora, no SALIC, os patrocinadores dos projetos que faltam. */
export function SponsorSyncButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [running, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn"
        disabled={running}
        onClick={() =>
          start(async () => {
            setMsg(null);
            try {
              const r = await syncPendingSponsorsAction();
              setMsg(
                r.apiDown
                  ? `O SALIC parou de responder. ${r.updated} projeto(s) atualizado(s); o resto fica para a rotina diária.`
                  : r.remaining > 0
                    ? `${r.updated} projeto(s) atualizado(s). Faltam ${r.remaining}: clique de novo para continuar.`
                    : `${r.updated} projeto(s) atualizado(s).`,
              );
            } catch {
              setMsg("Não foi possível buscar agora. Tente de novo em alguns minutos.");
            }
            router.refresh();
          })
        }
      >
        {running ? "Buscando no SALIC…" : `Buscar agora (${pending})`}
      </button>
      {running ? (
        <span className="text-sm text-[var(--gray-600)]">Pode levar alguns minutos.</span>
      ) : msg ? (
        <span className="text-sm text-[var(--gray-600)]">{msg}</span>
      ) : null}
    </div>
  );
}
