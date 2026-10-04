"use client";

import { useCallback, useEffect, useState } from "react";

type JobRow = {
  id: string;
  status: string;
  progressMsg: string | null;
  projectId: string | null;
  createdAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  zips: Array<{ pronac: string; zipPath: string; zipStoredBytes: number }>;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Na fila";
    case "running":
      return "Em andamento";
    case "success":
      return "Concluído";
    case "error":
      return "Erro";
    default:
      return status;
  }
}

export function LegalDossierHistory({ accountId }: { accountId: string }) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dossiers?accountId=${encodeURIComponent(accountId)}`);
    const data = (await res.json().catch(() => ({}))) as {
      jobs?: JobRow[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Falha ao carregar histórico");
      return;
    }
    setJobs(data.jobs || []);
    setError(null);
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download(jobId: string, zipPath: string) {
    const res = await fetch(
      `/api/dossiers/${jobId}/download?zipPath=${encodeURIComponent(zipPath)}`,
    );
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setError(data.error || "Falha no download");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  if (error && jobs.length === 0) {
    return <p className="mt-3 text-xs text-[var(--gray-500)]">{error}</p>;
  }
  if (jobs.length === 0) return null;

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-500)]">
        Histórico de dossiês
      </h3>
      <ul className="mt-2 space-y-2">
        {jobs.slice(0, 5).map((j) => (
          <li
            key={j.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gray-50)] px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium text-[var(--navy)]">{statusLabel(j.status)}</span>
              <span className="mx-1.5 text-[var(--gray-300)]">·</span>
              <span className="text-[var(--gray-500)]">
                {j.projectId ? "1 PRONAC" : "Todos os PRONACs"}
              </span>
              <span className="mx-1.5 text-[var(--gray-300)]">·</span>
              <span className="text-[var(--gray-500)]">
                {new Date(j.createdAt).toLocaleString("pt-BR")}
              </span>
              {j.errorMessage ? (
                <p className="mt-0.5 text-xs text-red-700">{j.errorMessage}</p>
              ) : null}
            </div>
            {j.status === "success" && j.zips.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {j.zips.map((z) => (
                  <button
                    key={z.zipPath}
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => void download(j.id, z.zipPath)}
                  >
                    {j.zips.length > 1 ? `PRONAC ${z.pronac}` : "Baixar"}{" "}
                    ({formatBytes(z.zipStoredBytes)})
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
