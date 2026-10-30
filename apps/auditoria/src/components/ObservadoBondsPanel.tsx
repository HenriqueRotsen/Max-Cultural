"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { setObservadoBonds } from "@/lib/actions";
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
  /** Marcações ainda não salvas: doc → ligado/desligado. */
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const enabled = new Set(enabledDocs);

  const withDoc = watched.filter(
    (w) => (w.cgccpf || "").replace(/\D/g, "").length >= 11,
  );

  function toggle(cgccpf: string, next: boolean) {
    setError(null);
    setSavedMsg(null);
    setDraft((cur) => {
      const copy = new Map(cur);
      if (next === enabled.has(cgccpf)) copy.delete(cgccpf);
      else copy.set(cgccpf, next);
      return copy;
    });
  }

  function save() {
    if (!draft.size) return;
    setError(null);
    const changes = Array.from(draft, ([cgccpf, on]) => ({ cgccpf, enabled: on }));
    startTransition(async () => {
      const result = await setObservadoBonds({
        salicAccountId,
        rulesetVersion,
        changes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(new Map());
      setSavedMsg(
        `${changes.length} vínculo${changes.length === 1 ? "" : "s"} salvo${changes.length === 1 ? "" : "s"}.`,
      );
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
          Marque os observados que têm vínculo art. 23 com{" "}
          <strong className="font-medium text-[var(--navy)]">{accountName}</strong>{" "}
          e clique em Salvar. Vale para todos os PRONACs deste proponente com
          esta IN.
        </p>
      </div>
      <div className="p-5">
        {withDoc.length === 0 ? (
          <p className="text-sm text-[var(--gray-500)]">
            Nenhum observado com pagamento neste PRONAC. Cadastre em
            Fornecedores › Observados quem receber neste projeto.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {withDoc.map((w) => {
                const dig = (w.cgccpf || "").replace(/\D/g, "");
                const changed = draft.has(dig);
                const on = changed ? draft.get(dig) === true : enabled.has(dig);
                return (
                  <li
                    key={w.id}
                    className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${changed ? "bg-[var(--gold-soft)]" : ""}`}
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
                        {changed ? " · não salvo" : ""}
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--navy)]"
                        checked={on}
                        disabled={pending}
                        onChange={(e) => toggle(dig, e.target.checked)}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              <span className="mr-auto text-sm text-[var(--gray-500)]" aria-live="polite">
                {draft.size
                  ? `${draft.size} alteração${draft.size === 1 ? "" : "ões"} não salva${draft.size === 1 ? "" : "s"}`
                  : savedMsg}
              </span>
              {draft.size ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={pending}
                  onClick={() => setDraft(new Map())}
                >
                  Descartar
                </button>
              ) : null}
              <button
                type="button"
                className="btn"
                disabled={!draft.size || pending}
                onClick={save}
              >
                Salvar
              </button>
            </div>
          </>
        )}
        {error ? <p className="mt-3 text-xs text-[#8a4b12]">{error}</p> : null}
      </div>
      {pending && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
              role="presentation"
            >
              <div
                role="alertdialog"
                aria-modal="true"
                aria-live="assertive"
                className="flex w-full max-w-xs items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-xl"
              >
                <span
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--navy)]"
                  aria-hidden
                />
                <div>
                  <div className="text-sm font-semibold text-[var(--navy)]">Salvando…</div>
                  <div className="text-xs text-[var(--gray-500)]">
                    Aplicando os vínculos e atualizando os PRONACs.
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
