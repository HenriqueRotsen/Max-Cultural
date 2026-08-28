"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";

export type RubricSelectOption = {
  id: string;
  label: string;
  available: number;
  isAdmin?: boolean;
  stageName?: string;
  itemName?: string;
  productName?: string;
  city?: string;
  state?: string;
  categoryHint?: string | null;
  /** Ordenação / destaque da sugestão. */
  suggested?: boolean;
};

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function matchesQuery(opt: RubricSelectOption, query: string) {
  if (!query) return true;
  const q = norm(query);
  const hay = norm(
    [
      opt.label,
      opt.stageName,
      opt.itemName,
      opt.productName,
      opt.city,
      opt.state,
      opt.isAdmin ? "admin administracao" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  return q.split(/\s+/).every((part) => hay.includes(part));
}

export function RubricSearchSelect({
  value,
  options,
  onChange,
  placeholder = "Buscar rubrica…",
  disabled,
}: {
  value: string;
  options: RubricSelectOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.id === value) || null;

  const filtered = useMemo(
    () => options.filter((o) => matchesQuery(o, query)),
    [options, query],
  );

  const groups = useMemo(() => {
    const map = new Map<string, RubricSelectOption[]>();
    for (const opt of filtered) {
      const key = opt.stageName?.trim() || "Outras etapas";
      const list = map.get(key) || [];
      list.push(opt);
      map.set(key, list);
    }
    return [...map.entries()].map(([stage, items]) => [
      stage,
      [...items].sort((a, b) => Number(!!b.suggested) - Number(!!a.suggested)),
    ] as const);
  }, [filtered]);

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
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
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
        {selected ? (
          <span className="min-w-0 truncate text-[var(--navy)]">
            <span className="font-medium">
              {selected.itemName || selected.label}
            </span>
            <span className="text-[var(--gray-500)]">
              {" · "}
              {[selected.stageName, selected.productName]
                .filter(Boolean)
                .join(" · ")}
              {selected.isAdmin ? " · Admin" : ""}
            </span>
          </span>
        ) : (
          <span className="text-[var(--gray-400)]">Selecione a rubrica…</span>
        )}
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
          <div className="max-h-72 overflow-y-auto py-1">
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--gray-400)]">
                Nenhuma rubrica encontrada
              </p>
            ) : (
              groups.map(([stage, items]) => (
                <div key={stage} className="py-1">
                  <p className="sticky top-0 bg-[var(--gray-50)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--gray-400)]">
                    {stage}
                  </p>
                  <ul>
                    {items.map((opt) => {
                      const active = opt.id === value;
                      return (
                        <li key={opt.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition ${
                              active
                                ? "bg-[var(--navy-soft)]"
                                : "hover:bg-[var(--gray-50)]"
                            }`}
                            onClick={() => {
                              onChange(opt.id);
                              setOpen(false);
                              setQuery("");
                            }}
                          >
                            <span className="font-medium text-[var(--navy)]">
                              {opt.itemName || opt.label}
                              {opt.suggested ? (
                                <span className="ml-1.5 text-xs font-semibold text-emerald-700">
                                  Sugestão
                                </span>
                              ) : null}
                              {opt.isAdmin ? (
                                <span className="ml-1.5 text-xs font-normal text-[var(--gray-400)]">
                                  Admin
                                </span>
                              ) : null}
                            </span>
                            <span className="flex flex-wrap gap-x-2 text-xs text-[var(--gray-500)]">
                              {opt.productName ? (
                                <span>{opt.productName}</span>
                              ) : null}
                              {opt.state || opt.city ? (
                                <span>
                                  {[opt.state, opt.city]
                                    .filter(Boolean)
                                    .join(" - ")}
                                </span>
                              ) : null}
                              <span className="tabular-nums">
                                disp. {formatCurrency(opt.available)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
