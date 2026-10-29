"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export type FilterSearchOption = {
  value: string;
  label: string;
};

export function FilterSearchSelect({
  value,
  options,
  onChange,
  placeholder = "Buscar…",
  emptyLabel = "Todos",
  allowEmpty = true,
  disabled,
}: {
  value: string;
  options: FilterSearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  /** Quando false, não oferece a opção vazia (útil para enums com valor default). */
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter((o) =>
      q.split(/\s+/).every((part) => norm(o.label).includes(part)),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--border)] bg-white px-3 text-left text-sm transition hover:border-[#c5d0e4] disabled:opacity-60"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`min-w-0 truncate ${
            selected ? "text-[var(--navy)]" : "text-[var(--gray-400)]"
          }`}
        >
          {selected?.label || emptyLabel}
        </span>
        <span className="shrink-0 text-[var(--gray-400)]" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg"
        >
          <div className="border-b border-[var(--border)] p-2">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--navy)]"
              autoComplete="off"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {allowEmpty ? (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={`flex w-full px-3 py-2 text-left text-sm hover:bg-[var(--gray-50)] ${
                  !value
                    ? "bg-[var(--navy-soft)] font-medium text-[var(--navy)]"
                    : ""
                }`}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQuery("");
                }}
              >
                {emptyLabel}
              </button>
            ) : null}
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-[var(--gray-400)]">
                Nenhum resultado
              </p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={`flex w-full px-3 py-2 text-left text-sm hover:bg-[var(--gray-50)] ${
                    opt.value === value
                      ? "bg-[var(--navy-soft)] font-medium text-[var(--navy)]"
                      : "text-[var(--navy)]"
                  }`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
