"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshSponsorsAction } from "@/lib/actions";

/** "Buscar no SALIC": atualiza os patrocinadores deste projeto agora. */
export function SponsorRefreshButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await refreshSponsorsAction(projectId);
            if (!r.ok) setMsg(r.error);
            else {
              setMsg(r.count === 0 ? "O SALIC não mostra patrocinadores para este projeto." : null);
              router.refresh();
            }
          })
        }
      >
        {pending ? "Buscando…" : "Buscar no SALIC"}
      </button>
      {msg ? <span className="text-sm text-[var(--gray-600)]">{msg}</span> : null}
    </div>
  );
}
