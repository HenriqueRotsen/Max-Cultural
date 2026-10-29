"use client";

import { useState } from "react";
import { formatBrMoney, parseBrMoney } from "@/lib/format";

const moneyInputClass =
  "!m-0 min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !p-0 text-right text-sm font-semibold tabular-nums text-[var(--navy)] !shadow-none outline-none";

const moneyShellClass =
  "flex h-11 w-full items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-white px-3 shadow-sm transition focus-within:border-[var(--navy)] focus-within:shadow-[0_0_0_3px_rgba(25,45,92,0.08)]";

export function MoneyInput({
  name,
  label,
  value,
  defaultValue,
  onChange,
  required,
  ariaLabel,
  className,
}: {
  name?: string;
  label?: string;
  /** Controlado: valor numérico atual. */
  value?: number | null;
  defaultValue?: number | null;
  onChange?: (next: number | null) => void;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState<number | null>(defaultValue ?? null);
  const current = controlled ? (value ?? null) : internal;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const display = focused && draft != null ? draft : formatBrMoney(current);

  function commit(next: number | null) {
    if (!controlled) setInternal(next);
    onChange?.(next);
  }

  return (
    <div className={label ? `field ${className || ""}`.trim() : className}>
      {label ? <span>{label}</span> : null}
      {name ? (
        <input
          type="hidden"
          name={name}
          value={current ?? ""}
          required={required && current == null}
        />
      ) : null}
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
          required={required && !name}
          aria-label={ariaLabel || label}
          placeholder="0,00"
          onFocus={() => {
            setFocused(true);
            setDraft(formatBrMoney(current));
          }}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw !== "" && !/^[\d.,\s]*$/.test(raw)) return;
            setDraft(raw);
            commit(parseBrMoney(raw));
          }}
          onBlur={() => {
            const parsed = parseBrMoney(draft ?? "");
            commit(parsed);
            setDraft(null);
            setFocused(false);
          }}
        />
      </label>
    </div>
  );
}
