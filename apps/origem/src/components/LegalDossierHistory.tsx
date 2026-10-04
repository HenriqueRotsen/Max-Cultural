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
  zipPath: string | null;
  zips: Array<{ pronac: string; zipPath: string; zipStoredBytes: number }>;
  aggregateBytes?: number | null;
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  async function download(job: JobRow) {
    setDownloadingId(job.id);
    setError(null);
    try {
      const res = await fetch(`/api/dossiers/${job.id}/download`);
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Falha no download");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingId(null);
    }
  }

  async function resume(jobId: string) {
    setDownloadingId(jobId);
    setError(null);
    try {
      const res = await fetch(`/api/dossiers/${jobId}/tick`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao continuar o dossiê");
        return;
      }
      await load();
    } finally {
      setDownloadingId(null);
    }
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
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      <ul className="mt-2 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--gray-50)]">
        {jobs.slice(0, 5).map((j) => {
          const pronacCount = j.zips.length || (j.projectId ? 1 : 0);
          const totalBytes =
            j.aggregateBytes ??
            j.zips.reduce((sum, z) => sum + (z.zipStoredBytes || 0), 0);
          return (
            <li
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-1.5 text-[var(--navy)]">
                  <span className="font-medium">{statusLabel(j.status)}</span>
                  <span className="text-[var(--gray-300)]">·</span>
                  <span className="text-[var(--gray-500)]">
                    {j.projectId
                      ? "1 PRONAC"
                      : pronacCount > 0
                        ? `${pronacCount} PRONACs`
                        : "Todos os PRONACs"}
                  </span>
                  <span className="text-[var(--gray-300)]">·</span>
                  <span className="text-[var(--gray-500)]">
                    {new Date(j.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                {j.errorMessage ? (
                  <p className="mt-0.5 text-xs text-red-700">{j.errorMessage}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {j.status === "running" || j.status === "pending" ? (
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={downloadingId === j.id}
                    onClick={() => void resume(j.id)}
                  >
                    {downloadingId === j.id ? "Retomando…" : "Continuar"}
                  </button>
                ) : null}
                {j.status === "success" && (j.zipPath || j.zips.length > 0) ? (
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={downloadingId === j.id}
                    onClick={() => void download(j)}
                  >
                    {downloadingId === j.id
                      ? "Preparando…"
                      : `Baixar dossiê${totalBytes ? ` (${formatBytes(totalBytes)})` : ""}`}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
