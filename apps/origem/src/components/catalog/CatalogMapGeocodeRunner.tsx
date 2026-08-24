"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function CatalogMapGeocodeRunner({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(
    pendingCount > 0
      ? `Localizando ${pendingCount} fornecedor(es) sem município…`
      : null,
  );
  const running = useRef(false);

  useEffect(() => {
    if (pendingCount <= 0 || running.current) return;
    running.current = true;
    let cancelled = false;

    async function run() {
      let remaining = pendingCount;
      let totalUpdated = 0;

      while (!cancelled && remaining > 0) {
        setStatus(
          `Buscando endereço no CNPJ… ${totalUpdated} ok · ${remaining} restante(s)`,
        );
        try {
          const res = await fetch("/api/catalog/geocode/backfill", {
            method: "POST",
          });
          if (!res.ok) {
            setStatus("Não foi possível localizar alguns endereços.");
            break;
          }
          const data = (await res.json()) as {
            updated: number;
            failed: number;
            remaining: number;
          };
          totalUpdated += data.updated;
          remaining = data.remaining;
          if (data.updated > 0) router.refresh();
          if (data.updated === 0) {
            setStatus(
              remaining > 0
                ? `${remaining} fornecedor(es) sem município no cadastro (CPF ou CNPJ sem endereço).`
                : totalUpdated > 0
                  ? `${totalUpdated} ponto(s) adicionados ao mapa.`
                  : null,
            );
            break;
          }
        } catch {
          setStatus("Falha de rede ao localizar endereços.");
          break;
        }
      }

      running.current = false;
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [pendingCount, router]);

  if (!status) return null;

  return (
    <p className="mt-2 text-xs text-[var(--gray-500)]" aria-live="polite">
      {status}
    </p>
  );
}
