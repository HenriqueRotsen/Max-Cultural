"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setObservadoBond } from "@/lib/actions";
import { formatCgccpf } from "@/lib/format";

type WatchedRow = {
  id: string;
  name: string;
  label?: string | null;
  cgccpf: string | null;
};

export function ObservadoBondsPanel({
  salicAccountId,
  accountName,
  rulesetVersion,
  rulesetSourceCode,
  watched,
  enabledDocs,
}: {
  salicAccountId: string;
  accountName: string;
  rulesetVersion: string;
  rulesetSourceCode: string;
  watched: WatchedRow[];
  enabledDocs: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = new Set(enabledDocs);

  const withDoc = watched.filter(
    (w) => (w.cgccpf || "").replace(/\D/g, "").length >= 11,
  );

  function toggle(cgccpf: string, next: boolean) {
    setError(null);
    setBusyDoc(cgccpf);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("salicAccountId", salicAccountId);
      fd.set("cgccpf", cgccpf);
      fd.set("rulesetVersion", rulesetVersion);
      fd.set("enabled", next ? "1" : "0");
      const result = await setObservadoBond(fd);
      setBusyDoc(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
        <h2 className="text-base font-semibold text-[var(--navy)]">
          Observados e vínculo · {rulesetSourceCode}
        </h2>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
                      Liga ou desliga o vínculo art. 23 de cada observado que
                      aparece neste PRONAC com{" "}
                      <strong className="font-medium text-[var(--navy)]">
                        {accountName}
                      </strong>
                      . Vale para todos os PRONACs deste proponente com esta IN.
        </p>
      </div>
      <div className="p-5">
        {withDoc.length === 0 ? (
          <p className="text-sm text-[var(--gray-500)]">
            Nenhum observado com pagamento neste PRONAC. Cadastre em
            Fornecedores › Observados quem receber neste projeto.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {withDoc.map((w) => {
              const dig = (w.cgccpf || "").replace(/\D/g, "");
              const on = enabled.has(dig);
              const busy = pending && busyDoc === dig;
              return (
                <li
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--navy)]">{w.name}</div>
                    <div className="text-xs text-[var(--gray-500)]">
                      {formatCgccpf(w.cgccpf)}
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <span className="text-[var(--gray-500)]">
                      {on ? "Com vínculo" : "Sem vínculo"}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--navy)]"
                      checked={on}
                      disabled={busy || pending}
                      onChange={(e) => toggle(dig, e.target.checked)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {error ? <p className="mt-3 text-xs text-[#8a4b12]">{error}</p> : null}
      </div>
    </section>
  );
}
