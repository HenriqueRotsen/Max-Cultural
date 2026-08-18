"use client";

import { useCallback, useEffect, useState } from "react";
import { FieldHelp, FieldLabel } from "@/components/FieldHelp";
import { SyncHistoryTable } from "@/components/SyncHistoryTable";
import { formatCgccpf } from "@/lib/format";
import { HELP } from "@/lib/help";

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

type AccountOption = {
  id: string;
  name: string;
  cgccpf: string;
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
  accounts,
  initialRecent = [],
  initialActive = null,
}: {
  accounts: AccountOption[];
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
  const [accountId, setAccountId] = useState("");
  const [pronac, setPronac] = useState("");
  const [forceCrawler, setForceCrawler] = useState(false);

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

    const selectedAccount = accountId
      ? accounts.find((a) => a.id === accountId) || null
      : null;
    const pronacs = pronac
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Mostra progresso imediatamente (antes da resposta da API)
    setActive(
      placeholderRun({
        id: "local-starting",
        forceCrawler,
        progressMessage: "Enviando pedido de atualização…",
        salicAccount: selectedAccount
          ? { name: selectedAccount.name, cgccpf: selectedAccount.cgccpf }
          : null,
      }),
    );

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: accountId || undefined,
          forceCrawler,
          pronacs: pronacs.length ? pronacs : undefined,
        }),
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
            forceCrawler,
            progressMessage: "Na fila…",
            salicAccount: selectedAccount
              ? { name: selectedAccount.name, cgccpf: selectedAccount.cgccpf }
              : null,
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
      : busy
        ? undefined
        : 0;

  return (
    <div className="space-y-6">
      <div className="card grid gap-4 p-5 md:grid-cols-2">
        <div className="field">
          <FieldLabel htmlFor="accountId" help={HELP.syncAccount}>
            Conta
          </FieldLabel>
          <select
            id="accountId"
            value={accountId}
            disabled={busy}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Todas com atualização ligada</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatCgccpf(a.cgccpf)})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <FieldLabel htmlFor="pronac" help={HELP.syncPronac}>
            Só um projeto (PRONAC)
          </FieldLabel>
          <input
            id="pronac"
            value={pronac}
            placeholder="Ex.: 153774 — escolha também a conta"
            disabled={busy}
            onChange={(e) => setPronac(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!busy) void startUpdate();
              }
            }}
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-[var(--gray-600)]">
          <input
            type="checkbox"
            checked={forceCrawler}
            disabled={busy}
            onChange={(e) => setForceCrawler(e.target.checked)}
          />
          <span className="inline-flex items-center gap-1.5">
            Usar área logada do SALIC
            <FieldHelp text={HELP.forceCrawler} />
          </span>
        </label>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-gold"
            disabled={busy}
            onClick={() => void startUpdate()}
          >
            {busy ? "Atualização em andamento…" : "Atualizar dados agora"}
          </button>
          {canCancel && (
            <button type="button" className="btn btn-ghost" onClick={() => void cancelActive()}>
              Cancelar atualização
            </button>
          )}
          {error && <p className="text-sm text-[#8a4b12]">{error}</p>}
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--navy)]">Progresso</h2>
          <div className="flex flex-wrap items-center gap-2">
            {(active || starting) && (
              <span className={`badge ${statusBadge(active?.status || "pending")}`}>
                {starting && !isRunning
                  ? "Iniciando"
                  : statusLabel(active?.status || "pending")}
              </span>
            )}
            {canCancel && (
              <button type="button" className="btn btn-ghost" onClick={() => void cancelActive()}>
                Cancelar
              </button>
            )}
          </div>
        </div>

        {active || starting ? (
          <>
            <p className="text-sm text-[var(--gray-600)]">
              {active?.salicAccount?.name ||
                (accountId
                  ? accounts.find((a) => a.id === accountId)?.name
                  : null) ||
                "Todas as contas"}
              {(active?.forceCrawler ?? forceCrawler)
                ? " · área logada"
                : " · atualização padrão"}
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--navy)]">
              {active?.progressMessage || "Iniciando…"}
            </p>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--gray-100)]">
              <div
                className="h-full rounded-full bg-[var(--gold)] transition-all duration-500"
                style={{
                  width:
                    percent == null
                      ? busy
                        ? "35%"
                        : "0%"
                      : `${percent}%`,
                  ...(percent == null && busy
                    ? { animation: "pulse 1.4s ease-in-out infinite" }
                    : {}),
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--gray-500)]">
              <span>
                Projetos:{" "}
                <strong className="text-[var(--navy)]">{active?.projectsSynced ?? 0}</strong>
                {active && active.progressTotal > 0 ? ` / ${active.progressTotal}` : ""}
              </span>
              <span>
                Pagamentos:{" "}
                <strong className="text-[var(--navy)]">{active?.paymentsUpserted ?? 0}</strong>
              </span>
              {active && active.progressTotal > 0 && (
                <span>
                  Etapa: {active.progressCurrent}/{active.progressTotal}
                  {percent != null ? ` (${percent}%)` : ""}
                </span>
              )}
            </div>

            {active?.log && (
              <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-[var(--gray-50)] p-3 text-xs text-[var(--gray-500)] whitespace-pre-wrap">
                {active.log.split("\n").slice(-12).join("\n")}
              </pre>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--gray-500)]">Nenhuma atualização em andamento.</p>
        )}
      </section>

      <section className="card p-5" id="historico-atualizacoes">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--navy)]">
              Histórico de atualizações
            </h2>
            <p className="mt-0.5 text-xs text-[var(--gray-500)]">
              Últimas sincronizações com o SALIC ({recent.length} no histórico recente).
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
            Atualizar lista
          </button>
        </div>
        <SyncHistoryTable recent={recent} />
      </section>
    </div>
  );
}
