"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startLegalDossierAction } from "@/lib/dossier/start";

type JobStatus = {
  id: string;
  status: string;
  progressPct: number;
  progressMsg: string | null;
  errorMessage: string | null;
  zipPath: string | null;
  zips: Array<{
    pronac: string;
    zipPath: string;
    zipStoredBytes: number;
    projectName: string | null;
  }>;
  workState?: { cursor: number; total: number; hasMore: boolean } | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isTerminal(status: string) {
  return status === "success" || status === "error" || status === "replaced";
}

export function LegalDossierButton({
  accountId,
  projectId,
  label = "Gerar Dossiê de Auditoria (Backup)",
  variant = "ghost",
  disabledReason,
}: {
  accountId: string;
  /** Project.id da auditoria — omitir = todos os PRONACs da conta */
  projectId?: string | null;
  label?: string;
  variant?: "ghost" | "primary" | "menu";
  disabledReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const tickingRef = useRef(false);

  const refresh = useCallback(async (jobId: string) => {
    if (!jobId || jobId === "pending") return null;
    const res = await fetch(`/api/dossiers/${jobId}`);
    const data = (await res.json().catch(() => ({}))) as JobStatus & { error?: string };
    if (!res.ok) {
      setError(data.error || "Falha ao consultar progresso");
      return null;
    }
    setError(null);
    setJob(data);
    return data;
  }, []);

  useEffect(() => {
    if (!open || !job?.id || job.id === "pending") return;
    if (isTerminal(job.status)) return;

    const timer = setInterval(() => {
      void refresh(job.id);
    }, 1500);

    const needsTick =
      job.status === "pending" ||
      (job.status === "running" &&
        (job.workState?.hasMore === true || job.workState == null));

    let cancelled = false;
    if (needsTick && !tickingRef.current) {
      tickingRef.current = true;
      void (async () => {
        try {
          await fetch(`/api/dossiers/${job.id}/tick`, { method: "POST" });
        } catch {
          // ignore — o poll continua
        } finally {
          tickingRef.current = false;
          if (!cancelled) await refresh(job.id);
        }
      })();
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, job?.id, job?.status, job?.progressPct, job?.workState?.hasMore, job?.workState?.cursor, refresh]);

  async function start() {
    if (disabledReason) {
      setError(disabledReason);
      setOpen(true);
      return;
    }
    setError(null);
    setStarting(true);
    setOpen(true);
    setJob({
      id: "pending",
      status: "pending",
      progressPct: 0,
      progressMsg: "Enviando pedido…",
      errorMessage: null,
      zipPath: null,
      zips: [],
      workState: null,
    });
    try {
      const result = await startLegalDossierAction({
        accountId,
        projectId: projectId || null,
      });
      if (!result.ok) {
        setError(result.error);
        setJob(null);
        return;
      }
      await refresh(result.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setJob(null);
    } finally {
      setStarting(false);
    }
  }

  async function downloadZip(zipPath?: string) {
    if (!job?.id || job.id === "pending") return;
    const qs = zipPath ? `?zipPath=${encodeURIComponent(zipPath)}` : "";
    const res = await fetch(`/api/dossiers/${job.id}/download${qs}`);
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!res.ok || !data.url) {
      setError(data.error || "Falha no download");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  const btnClass =
    variant === "primary"
      ? "btn"
      : variant === "menu"
        ? "w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)]"
        : "btn btn-ghost";

  return (
    <>
      <button
        type="button"
        className={btnClass}
        disabled={starting || Boolean(disabledReason)}
        title={disabledReason || label}
        onClick={() => void start()}
      >
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dossier-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2
                id="dossier-modal-title"
                className="text-base font-semibold text-[var(--navy)]"
              >
                Dossiê de Auditoria
              </h2>
              <button
                type="button"
                className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-[var(--gold-border)] bg-[var(--gold-soft)] px-3 py-2 text-sm text-[var(--navy)]">
                {error}
              </p>
            ) : null}

            {job ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-[var(--gray-600)]">
                  {job.progressMsg || "Aguardando…"}
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--gray-100)]">
                  <div
                    className="h-full rounded-full bg-[var(--navy)] transition-all"
                    style={{ width: `${Math.max(2, job.progressPct)}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--gray-500)]">
                  {job.progressPct}%
                  {job.workState?.total
                    ? ` · ${Math.min(job.workState.cursor, job.workState.total)}/${job.workState.total} PRONAC(s)`
                    : ""}
                </p>

                {job.status === "error" && job.errorMessage ? (
                  <p className="text-sm text-red-700">{job.errorMessage}</p>
                ) : null}

                {job.status === "success" ? (
                  <div className="space-y-2">
                    {job.zips.length <= 1 ? (
                      <button
                        type="button"
                        className="btn w-full"
                        onClick={() => void downloadZip(job.zips[0]?.zipPath)}
                      >
                        Baixar ZIP
                        {job.zips[0]
                          ? ` (${formatBytes(job.zips[0].zipStoredBytes)})`
                          : ""}
                      </button>
                    ) : (
                      <ul className="space-y-2">
                        {job.zips.map((z) => (
                          <li key={z.zipPath}>
                            <button
                              type="button"
                              className="btn btn-ghost w-full justify-between text-left"
                              onClick={() => void downloadZip(z.zipPath)}
                            >
                              <span>
                                PRONAC {z.pronac}
                                {z.projectName ? ` · ${z.projectName}` : ""}
                              </span>
                              <span className="text-xs text-[var(--gray-500)]">
                                {formatBytes(z.zipStoredBytes)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
