"use client";

import { useCallback, useEffect, useState } from "react";
import { AutoSyncControl, type AutoSyncInfo } from "@/components/AutoSyncControl";
import { SyncHistoryTable } from "@/components/SyncHistoryTable";

type SyncRunDto = {
  id: string;
  status: string;
  progressMessage: string | null;
  progressCurrent: number;
  progressTotal: number;
  projectsSynced: number;
  paymentsUpserted: number;
  errorMessage: string | null;
  log: string | null;
  createdAt: string;
  finishedAt: string | null;
  forceCrawler: boolean;
  workState: { cursor?: number; items?: unknown[] } | null;
  salicAccount: { name: string; cgccpf: string } | null;
};

function statusBadge(status: string) {
  if (status === "success") return "badge-success";
  if (status === "error") return "badge-warn";
  if (status === "running" || status === "pending") return "badge-warn";
  return "badge-muted";
}

function statusLabel(status: string) {
  if (status === "success") return "Concluída";
  if (status === "error") return "Com erro";
  if (status === "running") return "Em andamento";
  if (status === "pending") return "Na fila";
  return status;
}

function serializeRun(run: SyncRunDto): SyncRunDto {
  return {
    ...run,
    createdAt:
      typeof run.createdAt === "string"
        ? run.createdAt
        : new Date(run.createdAt).toISOString(),
    finishedAt: run.finishedAt
      ? typeof run.finishedAt === "string"
        ? run.finishedAt
        : new Date(run.finishedAt).toISOString()
      : null,
  };
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function placeholderRun(partial: {
  id: string;
  status?: string;
  forceCrawler?: boolean;
  progressMessage?: string;
  salicAccount?: SyncRunDto["salicAccount"];
}): SyncRunDto {
  return {
    id: partial.id,
    status: partial.status || "pending",
    progressMessage: partial.progressMessage || "Iniciando…",
    progressCurrent: 0,
    progressTotal: 0,
    projectsSynced: 0,
    paymentsUpserted: 0,
    errorMessage: null,
    log: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    forceCrawler: Boolean(partial.forceCrawler),
    workState: null,
    salicAccount: partial.salicAccount ?? null,
  };
}

export function SyncPanel({
  accountCount,
  autoSync,
  canManage,
  initialRecent = [],
  initialActive = null,
}: {
  accountCount: number;
  autoSync: AutoSyncInfo;
  canManage: boolean;
  initialRecent?: SyncRunDto[];
  initialActive?: SyncRunDto | null;
}) {
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState<SyncRunDto | null>(
    initialActive ? serializeRun(initialActive) : null,
  );
  const [recent, setRecent] = useState<SyncRunDto[]>(() =>
    initialRecent.map(serializeRun),
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/sync/status", { cache: "no-store" });
    if (!res.ok) {
      setError("Não foi possível carregar o histórico de atualizações.");
      return;
    }
    const data = (await res.json()) as {
      active: SyncRunDto | null;
      recent: SyncRunDto[];
    };
    setActive(data.active ? serializeRun(data.active) : null);
    setRecent((data.recent || []).map(serializeRun));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active || (active.status !== "running" && active.status !== "pending")) {
      return;
    }

    const timer = setInterval(() => {
      void refresh();
    }, 1500);

    const needsTick =
      active.status === "running" &&
      active.workState &&
      Array.isArray(active.workState.items) &&
      typeof active.workState.cursor === "number" &&
      active.workState.cursor < active.workState.items.length;

    let cancelled = false;

    if (needsTick) {
      void (async () => {
        try {
          await fetch("/api/sync/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ syncRunId: active.id }),
          });
        } catch {
          // ignore
        } finally {
          if (!cancelled) await refresh();
        }
      })();
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, refresh]);

  async function startUpdate() {
    setError(null);
    setStarting(true);

    // Mostra progresso imediatamente (antes da resposta da API)
    setActive(
      placeholderRun({
        id: "local-starting",
        forceCrawler: true,
        progressMessage: "Enviando pedido de atualização…",
      }),
    );

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceCrawler: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        syncRunId?: string;
        status?: string;
        run?: SyncRunDto;
      };

      if (!res.ok) {
        setActive(null);
        setError(data.error || "Falha ao iniciar a atualização");
        await refresh();
        return;
      }

      if (data.run) {
        setActive(serializeRun(data.run));
      } else if (data.syncRunId) {
        setActive(
          placeholderRun({
            id: data.syncRunId,
            status: data.status || "pending",
            forceCrawler: true,
            progressMessage: "Na fila…",
          }),
        );
      }

      await refresh();
    } catch (err) {
      setActive(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  async function cancelActive() {
    setError(null);
    if (!window.confirm("Cancelar a atualização em andamento?")) return;

    const res = await fetch("/api/sync/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      cancelled?: number;
    };
    if (!res.ok) {
      setError(data.error || "Não foi possível cancelar");
      await refresh();
      return;
    }

    setActive(null);
    await refresh();

    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 500));
      await refresh();
      const check = await fetch("/api/sync/status", { cache: "no-store" });
      if (!check.ok) break;
      const status = (await check.json()) as { active: SyncRunDto | null };
      if (!status.active) break;
      await fetch("/api/sync/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    }
    await refresh();
  }

  const isRunning = active?.status === "running" || active?.status === "pending";
  const busy = isRunning || starting;
  const canCancel = isRunning && active?.id !== "local-starting";
  const percent =
    active && active.progressTotal > 0
      ? Math.min(100, Math.round((active.progressCurrent / active.progressTotal) * 100))
      : undefined;
  const last = recent.find((r) => r.status !== "running" && r.status !== "pending") || null;

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-[16rem]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--navy)]">
                Atualização automática
              </h2>
              <span className={`badge ${autoSync.enabled ? "badge-success" : "badge-warn"}`}>
                {autoSync.enabled ? "Ligada" : "Desligada"}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--gray-500)]">
              {autoSync.enabled
                ? `Todo dia às 8h, para ${accountCount} proponente${accountCount === 1 ? "" : "s"}.`
                : `Desligada${autoSync.changedAt ? ` em ${formatWhen(autoSync.changedAt)}` : ""}${
                    autoSync.changedBy ? ` por ${autoSync.changedBy}` : ""
                  }. Só atualiza quando alguém clicar em “Atualizar agora”.`}
            </p>
            {!autoSync.enabled && autoSync.note ? (
              <p className="mt-1 text-sm text-[var(--gray-600)]">Motivo: {autoSync.note}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-gold"
              disabled={busy || accountCount === 0}
              onClick={() => void startUpdate()}
            >
              {busy ? "Atualizando…" : "Atualizar agora"}
            </button>
            {canCancel && (
              <button type="button" className="btn btn-ghost" onClick={() => void cancelActive()}>
                Cancelar
              </button>
            )}
          </div>
        </div>

        {busy ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-[var(--navy)]">
                {active?.progressMessage || "Iniciando…"}
              </span>
              <span className="text-[var(--gray-500)]">
                {active?.projectsSynced ?? 0} projeto(s) · {active?.paymentsUpserted ?? 0}{" "}
                pagamento(s)
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--gray-100)]">
              <div
                className="h-full rounded-full accent-bar transition-all duration-500"
                style={{
                  width: percent == null ? "35%" : `${percent}%`,
                  ...(percent == null ? { animation: "pulse 1.4s ease-in-out infinite" } : {}),
                }}
              />
            </div>
          </div>
        ) : last ? (
          <p className="text-sm text-[var(--gray-600)]">
            Última atualização: <strong className="text-[var(--navy)]">{formatWhen(last.finishedAt || last.createdAt)}</strong>
            {" · "}
            <span className={`badge ${statusBadge(last.status)}`}>{statusLabel(last.status)}</span>
            {" · "}
            {last.projectsSynced} projeto(s), {last.paymentsUpserted} pagamento(s)
          </p>
        ) : (
          <p className="text-sm text-[var(--gray-500)]">Ainda não houve atualização.</p>
        )}

        {accountCount === 0 ? (
          <p className="text-sm text-[#8a4b12]">
            Nenhum proponente cadastrado. Cadastre no MAX Financeiro › Proponentes (com usuário e
            senha do SALIC).
          </p>
        ) : null}
        {error && <p className="text-sm text-[#8a4b12]">{error}</p>}
      </section>

      <details className="card p-5" id="historico-atualizacoes">
        <summary className="cursor-pointer text-base font-semibold text-[var(--navy)]">
          Histórico ({Math.min(recent.length, 20)} mais recentes)
        </summary>
        <div className="mt-4">
          <SyncHistoryTable recent={recent.slice(0, 20)} />
        </div>
      </details>

      {canManage ? <AutoSyncControl autoSync={autoSync} /> : null}
    </div>
  );
}
