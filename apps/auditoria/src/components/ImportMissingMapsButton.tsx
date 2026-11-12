"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importMissingCorporateMaps } from "@/lib/actions";

/** Busca na Receita os sócios de todas as empresas que ainda não têm mapa. */
export function ImportMissingMapsButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (count === 0 && !msg) return null;
  return (
    <div className="space-y-1">
      {count === 0 ? null : (
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await importMissingCorporateMaps();
            setMsg(r.message);
            router.refresh();
          })
        }
      >
        {pending
          ? "Buscando na Receita…"
          : `Buscar sócios de ${count} empresa${count === 1 ? "" : "s"} sem mapa`}
      </button>
      )}
      {msg ? <p className="text-sm text-[var(--gray-600)]">{msg}</p> : null}
    </div>
  );
}
