"use client";

import { useActionState, useMemo, useState } from "react";
import {
  saveReadequacaoDraft,
  type ActionState,
} from "@/lib/planning/actions";
import type { ReadequacaoSnapshot } from "@/lib/planning/readequacao";
import { formatBrMoney, formatCurrency, parseBrMoney } from "@/lib/format";

const initial: ActionState = {};

const moneyInputClass =
  "!m-0 min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !p-0 text-right text-sm font-semibold tabular-nums text-[var(--navy)] !shadow-none outline-none";

const moneyShellClass =
  "flex w-full items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-white px-2.5 py-1.5 shadow-sm transition focus-within:border-[var(--navy)] focus-within:shadow-[0_0_0_3px_rgba(25,45,92,0.08)]";

function MoneyField({
  label,
  value,
  onChange,
  ariaLabel,
}: {
  label?: string;
  value: number | null | undefined;
  onChange: (next: number | null) => void;
  ariaLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const display = focused && draft != null ? draft : formatBrMoney(value);

  return (
    <div className={label ? "field" : undefined}>
      {label ? <span>{label}</span> : null}
      <label className={moneyShellClass}>
        <span className="shrink-0 text-xs font-semibold text-[var(--gray-400)]">
          R$
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={moneyInputClass}
          value={display}
          aria-label={ariaLabel || label}
          placeholder="0,00"
          onFocus={() => {
            setFocused(true);
            setDraft(formatBrMoney(value));
          }}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw !== "" && !/^[\d.,\s]*$/.test(raw)) return;
            setDraft(raw);
            onChange(parseBrMoney(raw));
          }}
          onBlur={() => {
            const parsed = parseBrMoney(draft ?? "");
            onChange(parsed);
            setDraft(null);
            setFocused(false);
          }}
        />
      </label>
    </div>
  );
}

export function ReadequacaoEditor({
  draftId,
  planningProjectId,
  initialSnapshot,
  expiresAt,
}: {
  draftId: string;
  planningProjectId: string;
  initialSnapshot: ReadequacaoSnapshot;
  expiresAt: string;
  source?: string;
}) {
  const [snap, setSnap] = useState(initialSnapshot);
  const saveAction = saveReadequacaoDraft.bind(null, draftId);
  const [state, formAction, pending] = useActionState(saveAction, initial);

  const total = useMemo(
    () =>
      Math.round(
        snap.lines.reduce((s, l) => s + (Number(l.approvedAmount) || 0), 0) * 100,
      ) / 100,
    [snap.lines],
  );

  function updateLineValue(id: string, value: number) {
    const amount = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
    setSnap((prev) => ({
      ...prev,
      lines: prev.lines.map((l) =>
        l.id === id
          ? { ...l, approvedAmount: amount, homologatedAmount: amount }
          : l,
      ),
      totalApproved: 0,
    }));
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <div>
          <p className="font-medium text-[var(--navy)]">
            Montagem para envio ao SALIC
          </p>
          <p className="text-[var(--gray-500)]">
            Expira em {new Date(expiresAt).toLocaleString("pt-BR")} · Total{" "}
            {formatCurrency(total)}
          </p>
        </div>
        <a
          className="btn"
          href={`/planejamento/${planningProjectId}/readequacao/${draftId}/export`}
        >
          Exportar CSV
        </a>
      </div>

      <form action={formAction} className="card space-y-4 p-5">
        <input
          type="hidden"
          name="snapshotJson"
          value={JSON.stringify({ ...snap, totalApproved: total })}
        />
        {state.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Rascunho salvo.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyField
            label="Captado (ref.)"
            value={snap.valorCaptado}
            onChange={(v) => setSnap((p) => ({ ...p, valorCaptado: v }))}
          />
          <MoneyField
            label="Recebido"
            value={snap.captadoRecebido}
            onChange={(v) => setSnap((p) => ({ ...p, captadoRecebido: v }))}
          />
          <MoneyField
            label="Rendimentos"
            value={snap.rendimentos}
            onChange={(v) => setSnap((p) => ({ ...p, rendimentos: v }))}
          />
          <MoneyField
            label="Transferido"
            value={snap.captadoTransferido}
            onChange={(v) =>
              setSnap((p) => ({ ...p, captadoTransferido: v }))
            }
          />
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[var(--border)]">
          <div className="max-h-[min(58vh,32rem)] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--border)]">
                <tr className="text-xs text-[var(--gray-500)]">
                  <th className="bg-white px-3 py-2.5">Etapa</th>
                  <th className="bg-white px-3 py-2.5">Item</th>
                  <th className="bg-white px-3 py-2.5">Produto</th>
                  <th className="bg-white px-3 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {snap.lines.map((line) => (
                  <tr
                    key={line.id}
                    className="border-t border-[var(--border)] transition hover:bg-[var(--gray-50)]"
                  >
                    <td className="px-3 py-2 text-[var(--gray-500)]">
                      {line.stageName}
                    </td>
                    <td className="px-3 py-2 font-medium text-[var(--navy)]">
                      {line.itemName}
                    </td>
                    <td className="px-3 py-2 text-[var(--gray-500)]">
                      {line.productName}
                    </td>
                    <td className="px-3 py-2">
                      <div className="ml-auto w-[11.5rem]">
                        <MoneyField
                          value={line.approvedAmount}
                          ariaLabel={`Valor de ${line.itemName}`}
                          onChange={(v) =>
                            updateLineValue(line.id, v == null ? 0 : v)
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t-2 border-[var(--border)] bg-[var(--gray-50)] px-3 py-3">
            <p className="text-sm font-semibold text-[var(--navy)]">Total</p>
            <div className="flex min-w-[11.5rem] items-center justify-end rounded-[10px] bg-[var(--navy-soft)] px-3 py-1.5">
              <span className="text-sm font-bold tabular-nums text-[var(--navy)]">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Salvando…" : "Salvar rascunho"}
        </button>
      </form>
    </div>
  );
}
