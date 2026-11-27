"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCgccpf, formatCurrency } from "@/lib/format";
import type { SponsorOption } from "@/lib/sponsor-group";

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Escolha dos patrocinadores do grupo; o grupo vai para o endereço (`?aba=grupo&s=…`). */
export function SponsorGroupPicker({
  options,
  selected,
  suggestions,
}: {
  options: SponsorOption[];
  selected: string[];
  suggestions: SponsorOption[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected));
  const [q, setQ] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);

  const shown = useMemo(() => {
    const terms = plain(q).split(/\s+/).filter(Boolean);
    const qDigits = q.replace(/\D/g, "");
    return options.filter((o) => {
      if (onlyPicked && !picked.has(o.key)) return false;
      if (!terms.length) return true;
      if (qDigits.length >= 3 && o.cgccpf.includes(qDigits)) return true;
      const hay = plain(o.name);
      return terms.every((t) => hay.includes(t));
    });
  }, [options, q, onlyPicked, picked]);

  const toggle = (key: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const apply = (keys: Set<string>) => {
    const sp = new URLSearchParams({ aba: "grupo" });
    for (const k of keys) sp.append("s", k);
    router.push(`/patrocinadores?${sp.toString()}`);
  };

  const pickedTotal = options.filter((o) => picked.has(o.key)).reduce((n, o) => n + o.total, 0);
  const changed = picked.size !== selected.length || selected.some((k) => !picked.has(k));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar patrocinador ou CNPJ (ex.: Vale)"
          className="min-w-0 flex-1"
          aria-label="Buscar patrocinador"
        />
        <label className="inline-flex items-center gap-1.5 text-sm text-[var(--gray-600)]">
          <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />
          Só os escolhidos
        </label>
      </div>

      {suggestions.length ? (
        <div className="rounded-xl border border-[var(--gold-border)] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--navy)]">
          <p className="font-semibold">Mesma raiz de CNPJ (provável mesma empresa, outra filial)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((o) => (
              <button
                key={o.key}
                type="button"
                className="badge badge-muted hover:underline"
                onClick={() => toggle(o.key)}
                aria-pressed={picked.has(o.key)}
              >
                {picked.has(o.key) ? "✓ " : "+ "}
                {o.name} · {formatCgccpf(o.cgccpf)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
        {shown.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--gray-500)]">Nenhum patrocinador encontrado.</li>
        ) : (
          shown.map((o) => (
            <li key={o.key}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--navy-soft)]/50">
                <input type="checkbox" checked={picked.has(o.key)} onChange={() => toggle(o.key)} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-[var(--navy)]">{o.name}</span>
                  <span className="ml-2 text-xs text-[var(--gray-500)]">{formatCgccpf(o.cgccpf)}</span>
                </span>
                <span className="whitespace-nowrap text-xs text-[var(--gray-500)]">
                  {o.aportes} aporte{o.aportes === 1 ? "" : "s"} · {formatCurrency(o.total)}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--gray-600)]">
          {picked.size
            ? `${picked.size} escolhido${picked.size === 1 ? "" : "s"} · ${formatCurrency(pickedTotal)}`
            : "Marque os patrocinadores que formam o grupo."}
        </p>
        <div className="flex gap-2">
          {picked.size ? (
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(new Set())}>
              Limpar
            </button>
          ) : null}
          <button type="button" className="btn" disabled={!picked.size || !changed} onClick={() => apply(picked)}>
            Ver o grupo
          </button>
        </div>
      </div>
    </div>
  );
}
