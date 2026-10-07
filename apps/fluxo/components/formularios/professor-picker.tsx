"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProfessorUserOpt = { id: string; name: string; email: string };

type Props = {
  users: ProfessorUserOpt[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

function labelOf(u: ProfessorUserOpt) {
  return `${u.name} (${u.email})`;
}

export function ProfessorPicker({ users, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const selected = value
    .map((id) => byId.get(id))
    .filter((u): u is ProfessorUserOpt => Boolean(u));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

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

  function toggle(id: string) {
    if (disabled) return;
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );
  }

  function remove(id: string) {
    if (disabled) return;
    onChange(value.filter((x) => x !== id));
  }

  return (
    <div ref={rootRef} className="relative space-y-2">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <li
              key={u.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/80 bg-muted/40 px-2 py-1 text-xs"
            >
              <span className="truncate">{u.name}</span>
              <span className="truncate text-muted-foreground">({u.email})</span>
              {!disabled ? (
                <button
                  type="button"
                  className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remover ${u.name}`}
                  onClick={() => remove(u.id)}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none",
          "hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="truncate text-muted-foreground">
          {selected.length
            ? `${selected.length} professor(es) selecionado(s)`
            : "Buscar e selecionar professores…"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md ring-1 ring-foreground/10">
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {filtered.map((u) => {
              const checked = value.includes(u.id);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => toggle(u.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60",
                      checked && "bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border border-input",
                        checked &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {checked ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{labelOf(u)}</span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum usuário encontrado para essa busca.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
