"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Mostra modal quando satélites (Origem/Fluxo) devolvem o usuário com ?error=. */
export function AccessDeniedDialog() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const message = params.get("error");
  const [open, setOpen] = useState(Boolean(message));

  useEffect(() => {
    setOpen(Boolean(message));
  }, [message]);

  function dismiss() {
    setOpen(false);
    const next = new URLSearchParams(params.toString());
    next.delete("error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (!open || !message) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-denied-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
        <h2
          id="access-denied-title"
          className="text-base font-semibold text-[var(--navy)]"
        >
          Acesso não liberado
        </h2>
        <p className="mt-2 text-sm text-[var(--gray-600)]">{message}</p>
        <p className="mt-2 text-sm text-[var(--gray-500)]">
          Fale com um administrador se precisar dessa área. Você permanece no MAX
          Cultural.
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn" onClick={dismiss}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
