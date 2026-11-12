"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fillJobCitiesFromReceita, setJobCity } from "@/lib/planning/jobs-actions";

/** Botões do relatório: buscar cidades na Receita, baixar CSV e imprimir. */
export function JobsReportActions({
  projectId,
  csv,
  filename,
  missingCnpj,
}: {
  projectId: string;
  csv: string;
  filename: string;
  missingCnpj: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap gap-2">
        {missingCnpj > 0 ? (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMsg(null);
                const r = await fillJobCitiesFromReceita(projectId);
                setMsg(r.error || r.message || null);
                router.refresh();
              })
            }
          >
            {pending ? "Buscando na Receita…" : `Buscar cidade de ${missingCnpj} CNPJ(s) na Receita`}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={download}>
          Baixar planilha (CSV)
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          Imprimir / salvar PDF
        </button>
      </div>
      {msg ? <p className="text-sm text-[var(--gray-600)]">{msg}</p> : null}
    </div>
  );
}

/** Cidade/UF de quem está sem endereço no cadastro (CPF não tem consulta pública). */
export function JobCityForm({
  projectId,
  doc,
  name,
}: {
  projectId: string;
  doc: string;
  name: string;
}) {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await setJobCity(projectId, doc, name, city, uf);
          if (r.error) {
            setError(r.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <input
        aria-label={`Cidade de ${name}`}
        placeholder="Cidade"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className="h-9 w-40 rounded-lg border border-[var(--border)] px-2 text-sm"
      />
      <input
        aria-label={`UF de ${name}`}
        placeholder="UF"
        maxLength={2}
        value={uf}
        onChange={(e) => setUf(e.target.value.toUpperCase())}
        className="h-9 w-14 rounded-lg border border-[var(--border)] px-2 text-sm uppercase"
      />
      <button type="submit" className="btn btn-ghost h-9 px-3 text-sm" disabled={pending}>
        {pending ? "Salvando…" : "Salvar"}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </form>
  );
}
