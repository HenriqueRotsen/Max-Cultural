"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  beginSalicPublishCountdown,
  cancelSalicPublish,
  startSalicPublishUpload,
} from "@/lib/planning/actions";

const COUNTDOWN_SECONDS = 10;

export function SalicPublishPanel({
  planningProjectId,
  projectName,
  confirmLabel,
  publishStatus,
  publishMessage,
  readinessOk,
  readinessReasons,
}: {
  planningProjectId: string;
  projectName: string;
  /** Texto exato que o usuário deve digitar */
  confirmLabel: string;
  publishStatus: string;
  publishMessage: string | null;
  readinessOk: boolean;
  readinessReasons: string[];
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const waiting = publishStatus === "AGUARDANDO";
  const uploading = publishStatus === "ENVIANDO";
  const busy = waiting || uploading;

  useEffect(() => {
    if (!waiting) {
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(COUNTDOWN_SECONDS);
    const started = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        COUNTDOWN_SECONDS - Math.floor((Date.now() - started) / 1000),
      );
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(timer);
        start(async () => {
          const result = await startSalicPublishUpload(planningProjectId);
          if (result.error) setError(result.error);
          router.refresh();
        });
      }
    }, 250);
    return () => clearInterval(timer);
  }, [waiting, planningProjectId, router]);

  function requestCancel() {
    if (
      !window.confirm(
        "Cancelar o envio ao SALIC? Será pedida confirmação e o processo será interrompido.",
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const result = await cancelSalicPublish(planningProjectId);
      if (result.error) setError(result.error);
      setOpen(false);
      setTyped("");
      router.refresh();
    });
  }

  function confirmTyped() {
    setError(null);
    start(async () => {
      const result = await beginSalicPublishCountdown(planningProjectId, typed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setTyped("");
      router.refresh();
    });
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--navy)]">Enviar ao SALIC</h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            Notas e comprovantes ficam guardados no Origem. Quem tem permissão pode
            enviar o pacote pela área logada do SALIC — com confirmação por escrito e
            contagem de segurança.
          </p>
        </div>
        {!busy && readinessOk ? (
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            Subir projeto
          </button>
        ) : null}
        {busy ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={requestCancel}
          >
            Cancelar envio
          </button>
        ) : null}
      </div>

      {!readinessOk ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
          {readinessReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}

      {publishMessage ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            publishStatus === "FALHOU" || publishStatus === "CANCELADO"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : publishStatus === "CONCLUIDO"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-[var(--border)] bg-[var(--gray-50)] text-[var(--gray-700)]"
          }`}
        >
          {publishMessage}
          {waiting && secondsLeft != null
            ? ` · ${secondsLeft}s`
            : ""}
        </p>
      ) : null}

      {open ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm text-[var(--gray-600)]">
            Para confirmar o envio de <strong>{projectName}</strong>, digite o nome
            do projeto exatamente como abaixo:
          </p>
          <p className="rounded-lg bg-[var(--gray-50)] px-3 py-2 font-mono text-sm text-[var(--navy)]">
            {confirmLabel}
          </p>
          <label className="field">
            <span className="text-xs text-[var(--gray-500)]">Nome do projeto</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              disabled={pending}
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              disabled={pending || !typed.trim()}
              onClick={confirmTyped}
            >
              {pending ? "Confirmando…" : "Confirmar e aguardar 10 segundos"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {error && !open ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
