"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type FormEvent } from "react";
import type { CompareResult, CompareRow } from "@/lib/compare/projects-sheet";

type ApiResult = CompareResult & { fileName: string };

type Filter = "all" | "ok" | "diff" | "missing_in_system" | "missing_in_sheet";

const STATUS_LABEL: Record<CompareRow["status"], string> = {
  ok: "Bate",
  diff: "Diferença",
  missing_in_system: "Só na planilha",
  missing_in_sheet: "Só no MAX Origem",
};

function statusBadgeClass(status: CompareRow["status"]) {
  if (status === "ok") return "badge badge-success";
  if (status === "diff") return "badge badge-warn";
  if (status === "missing_in_system") return "badge badge-warn";
  return "badge badge-muted";
}

function fieldTone(status: string) {
  if (status === "match") return "text-[#176b3a]";
  if (status === "diff") return "text-[#b42318] font-semibold";
  if (status === "sheet_only" || status === "system_only") return "text-[var(--gray-500)]";
  return "text-[var(--gray-400)]";
}

export function ProjectSheetComparePanel() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecione a planilha .xlsx");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/compare/projects", { method: "POST", body: fd });
      const data = (await res.json()) as ApiResult & { error?: string };
      if (!res.ok) {
        setResult(null);
        setError(data.error || "Falha na comparação");
        return;
      }
      setResult(data);
      setFilter("all");
      setExpanded({});
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Falha na comparação");
    } finally {
      setPending(false);
    }
  }

  const filtered = useMemo(() => {
    if (!result) return [];
    if (filter === "all") return result.rows;
    return result.rows.filter((r) => r.status === filter);
  }, [result, filter]);

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void onSubmit(e)} className="card space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">Enviar planilha</h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            Esperado: aba “Listar Projetos” com Pronac, Proponente, Projeto, Situação, IN,
            Captado e Limite.
          </p>
        </div>
        <div className="field max-w-xl">
          <label htmlFor="compare-file" className="text-sm font-medium text-[var(--navy)]">
            Arquivo Excel
          </label>
          <input
            id="compare-file"
            name="file"
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={pending}
          />
        </div>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Comparando…" : "Comparar com o MAX Origem"}
        </button>
        {error ? (
          <p className="text-sm text-[#b42318]" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {result ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Na planilha" value={String(result.summary.sheetCount)} />
            <Stat label="No MAX Origem" value={String(result.summary.systemCount)} />
            <Stat label="Batem" value={String(result.summary.ok)} tone="ok" />
            <Stat
              label="Com diferença"
              value={String(result.summary.diff)}
              tone={result.summary.diff ? "warn" : undefined}
            />
            <Stat
              label="Só na planilha"
              value={String(result.summary.missingInSystem)}
              tone={result.summary.missingInSystem ? "warn" : undefined}
            />
            <Stat
              label="Só no MAX Origem"
              value={String(result.summary.missingInSheet)}
              tone={result.summary.missingInSheet ? "muted" : undefined}
            />
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Associações de colunas
            </h2>
            <p className="mt-1 mb-3 text-sm text-[var(--gray-500)]">
              Arquivo: <strong>{result.fileName}</strong>
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Planilha</th>
                    <th>MAX Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {result.mapping.map((m) => (
                    <tr key={m.sheet}>
                      <td>{m.sheet}</td>
                      <td className="text-[var(--gray-600)]">{m.system}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--navy)]">Comparação por PRONAC</h2>
                <p className="mt-1 text-sm text-[var(--gray-500)]">
                  {filtered.length} de {result.rows.length} linhas
                </p>
              </div>
              <div className="field min-w-[12rem]">
                <label htmlFor="compare-filter" className="text-sm font-medium text-[var(--navy)]">
                  Filtrar
                </label>
                <select
                  id="compare-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as Filter)}
                >
                  <option value="all">Todos</option>
                  <option value="diff">Com diferença</option>
                  <option value="missing_in_system">Só na planilha</option>
                  <option value="missing_in_sheet">Só no MAX Origem</option>
                  <option value="ok">Batem</option>
                </select>
              </div>
            </div>

            <div className="table-wrap mt-4">
              <table className="data">
                <thead>
                  <tr>
                    <th className="w-10" aria-label="Detalhe" />
                    <th>PRONAC</th>
                    <th>Status</th>
                    <th>Projeto (planilha)</th>
                    <th>Proponente</th>
                    <th>Captado planilha</th>
                    <th>Captado MAX Origem</th>
                    <th>IN</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const open = Boolean(expanded[row.pronac]);
                    const captadoSheet =
                      row.fields.find((f) => f.field === "captado")?.sheet || "—";
                    const captadoSys =
                      row.fields.find((f) => f.field === "captado")?.system || "—";
                    const inField = row.fields.find((f) => f.field === "in");
                    return (
                      <Fragment key={row.pronac}>
                        <tr>
                          <td>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--navy)] hover:bg-[var(--gray-50)]"
                              aria-expanded={open}
                              aria-label={open ? "Recolher" : "Ver campos"}
                              onClick={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [row.pronac]: !prev[row.pronac],
                                }))
                              }
                            >
                              <Chevron open={open} />
                            </button>
                          </td>
                          <td>
                            {row.system ? (
                              <Link
                                href={`/panorama/pronac/${row.pronac}`}
                                className="font-semibold text-[var(--navy)] underline-offset-2 hover:text-[var(--gold)] hover:underline"
                              >
                                {row.pronac}
                              </Link>
                            ) : (
                              <span className="font-semibold text-[var(--navy)]">{row.pronac}</span>
                            )}
                          </td>
                          <td>
                            <span className={statusBadgeClass(row.status)}>
                              {STATUS_LABEL[row.status]}
                            </span>
                          </td>
                          <td>{row.sheet?.projeto || row.system?.name || "—"}</td>
                          <td>
                            {row.sheet?.proponente || row.system?.accountName || "—"}
                          </td>
                          <td>{captadoSheet}</td>
                          <td>{captadoSys}</td>
                          <td className="text-xs">
                            <div className={fieldTone(inField?.status || "skip")}>
                              {inField?.sheet || "—"}
                            </div>
                            <div className="text-[var(--gray-400)]">
                              → {inField?.system || "—"}
                            </div>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="bg-[var(--gray-50)]/80">
                            <td />
                            <td colSpan={7}>
                              <div className="table-wrap py-2">
                                <table className="data">
                                  <thead>
                                    <tr>
                                      <th>Campo</th>
                                      <th>Planilha</th>
                                      <th>MAX Origem</th>
                                      <th>Resultado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.fields
                                      .filter((f) => f.status !== "skip")
                                      .map((f) => (
                                        <tr key={`${row.pronac}-${f.field}`}>
                                          <td className="font-medium text-[var(--navy)]">
                                            {f.label}
                                          </td>
                                          <td>{f.sheet}</td>
                                          <td>{f.system}</td>
                                          <td className={fieldTone(f.status)}>
                                            {f.status === "match"
                                              ? "Igual"
                                              : f.status === "diff"
                                                ? "Diferente"
                                                : f.status === "sheet_only"
                                                  ? "Só planilha"
                                                  : "Só MAX Origem"}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-[var(--gray-500)]">
                        Nenhuma linha neste filtro.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          tone === "ok"
            ? "text-[#176b3a]"
            : tone === "warn"
              ? "text-[#b42318]"
              : "text-[var(--navy)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
