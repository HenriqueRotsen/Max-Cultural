"use client";

import { useMemo, useState, useTransition } from "react";

/** Minúsculas e sem acento, para a busca casar "praca" com "Praça". */
function norm(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

type ProjectOption = {
  id: string;
  pronac: string;
  name: string;
  accountId: string;
  accountName: string;
};

export function AuditoriaReportForm({
  projects,
}: {
  projects: ProjectOption[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState("");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const accounts = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.accountId, p.accountName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [projects]);

  const visible = useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    return projects.filter((p) => {
      if (accountFilter && p.accountId !== accountFilter) return false;
      if (!terms.length) return true;
      const hay = norm(`${p.pronac} ${p.name} ${p.accountName}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [projects, accountFilter, query]);

  function toggle(pronac: string) {
    setSelected((cur) =>
      cur.includes(pronac) ? cur.filter((x) => x !== pronac) : [...cur, pronac],
    );
  }

  function selectAllVisible() {
    setSelected((cur) => {
      const set = new Set(cur);
      for (const p of visible) set.add(p.pronac);
      return Array.from(set);
    });
  }

  function clearAll() {
    setSelected([]);
  }

  function generate() {
    if (!selected.length) return;
    const qs = new URLSearchParams();
    qs.set("pronacs", selected.join(","));
    startTransition(() => {
      window.location.href = `/api/reports/auditoria?${qs.toString()}`;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="field min-w-[14rem] flex-1">
          <label htmlFor="projectSearch">Buscar</label>
          <input
            id="projectSearch"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="PRONAC, nome do projeto ou proponente"
            autoComplete="off"
          />
        </div>
        <div className="field min-w-[14rem]">
          <label htmlFor="accountFilter">Proponente</label>
          <select
            id="accountFilter"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-ghost" onClick={selectAllVisible}>
          Marcar visíveis
        </button>
        <button type="button" className="btn btn-ghost" onClick={clearAll}>
          Limpar
        </button>
        <button
          type="button"
          className="btn"
          disabled={!selected.length || pending}
          onClick={generate}
        >
          {pending ? "Gerando…" : `Gerar PDF (${selected.length})`}
        </button>
      </div>

      {query || accountFilter ? (
        <p className="text-sm text-[var(--gray-500)]" aria-live="polite">
          {visible.length} de {projects.length} PRONACs
          {selected.length ? ` · ${selected.length} marcados no total` : ""}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="data">
          <thead>
            <tr>
              <th className="w-10" />
              <th>PRONAC</th>
              <th>Projeto</th>
              <th>Proponente</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-[var(--gray-500)]">
                  Nenhum PRONAC encontrado.
                </td>
              </tr>
            ) : (
              visible.map((p) => {
                const checked = selected.includes(p.pronac);
                return (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.pronac)}
                        aria-label={`Selecionar ${p.pronac}`}
                      />
                    </td>
                    <td className="font-medium text-[var(--navy)]">{p.pronac}</td>
                    <td>{p.name}</td>
                    <td className="text-sm text-[var(--gray-600)]">{p.accountName}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--gray-500)]">
        O PDF inclui situação, mapa do proponente, observados (tem/não tem
        vínculo), agregados e linhas de pagamento de cada PRONAC selecionado.
      </p>
    </div>
  );
}
