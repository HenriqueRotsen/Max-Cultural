import { prisma } from "@/lib/db";
import { formatCgccpf } from "@/lib/crypto";
import { resolvePronacsForAccount, syncAccountViaApi, syncProjectViaApi } from "@/lib/salic/persist";
import { ProdutosCache } from "@/lib/salic/produtos-cache";

export type SyncOptions = {
  salicAccountId?: string;
  forceCrawler?: boolean;
  pronacs?: string[];
  /** Restringe sync às contas deste workspace (obrigatório no app). */
  workspaceId?: string;
};

type WorkItem = {
  accountId: string;
  accountName: string;
  pronac: string;
  name: string | null;
};

type WorkState = {
  mode: "api" | "crawler";
  cursor: number;
  items: WorkItem[];
  forceCrawler: boolean;
};

export class SyncCancelledError extends Error {
  /** true = cancelamento explícito do usuário no banco */
  readonly byUser: boolean;

  constructor(message = "Sincronização interrompida", byUser = false) {
    super(message);
    this.name = "SyncCancelledError";
    this.byUser = byUser;
  }
}

async function writeProgress(
  syncRunId: string,
  data: {
    progressMessage?: string;
    progressCurrent?: number;
    progressTotal?: number;
    projectsSynced?: number;
    paymentsUpserted?: number;
    log?: string;
    workState?: WorkState | null;
    status?: "pending" | "running" | "success" | "error" | "partial";
    finishedAt?: Date | null;
    errorMessage?: string | null;
  },
) {
  const current = await prisma.syncRun.findUnique({
    where: { id: syncRunId },
    select: { status: true, errorMessage: true, progressMessage: true },
  });
  if (!current) return;

  if (isUserCancelled(current)) {
    throw new SyncCancelledError("Cancelada pelo usuário", true);
  }

  if (current.status !== "running" && current.status !== "pending") {
    // Já finalizou — não grava progresso nem marca como cancelada pelo usuário
    throw new SyncCancelledError("Sincronização já finalizada", false);
  }

  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: data as never,
  });
}

function isUserCancelled(run: {
  errorMessage: string | null;
  progressMessage: string | null;
}) {
  return (
    run.errorMessage === "Cancelada pelo usuário" ||
    run.progressMessage === "Cancelada"
  );
}

/** Para o trabalho em memória quando o status no banco já foi cancelado/finalizado. */
async function assertSyncStillActive(syncRunId: string) {
  const run = await prisma.syncRun.findUnique({
    where: { id: syncRunId },
    select: { status: true, errorMessage: true, progressMessage: true },
  });
  if (!run) throw new SyncCancelledError("Sincronização não encontrada", false);
  if (isUserCancelled(run)) {
    throw new SyncCancelledError("Cancelada pelo usuário", true);
  }
  if (run.status !== "running" && run.status !== "pending") {
    throw new SyncCancelledError("Sincronização já finalizada", false);
  }
}

export async function enqueueSync(options: SyncOptions = {}) {
  const forceCrawler = options.forceCrawler ?? false;
  const pronacs = (options.pronacs || []).filter(Boolean);

  if (options.workspaceId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: options.workspaceId },
    });
    if (!workspace || workspace.plan !== "PRO") {
      throw new Error(
        "A atualização com o SALIC não está disponível neste workspace.",
      );
    }
  }

  const running = await prisma.syncRun.findFirst({
    where: { status: { in: ["pending", "running"] } },
    orderBy: { createdAt: "desc" },
  });
  if (running) {
    throw new Error("Já existe uma sincronização em andamento. Aguarde terminar.");
  }

  const accounts = await accountsForSync(options);

  if (accounts.length === 0) {
    throw new Error("Nenhuma conta ativa para sincronizar");
  }

  if (pronacs.length > 0 && accounts.length !== 1) {
    throw new Error("Para sync por PRONAC, selecione uma conta específica");
  }

  return prisma.syncRun.create({
    data: {
      status: "pending",
      forceCrawler,
      startedAt: new Date(),
      salicAccountId: options.salicAccountId || null,
      progressMessage: "Na fila…",
      progressCurrent: 0,
      progressTotal: 0,
      log: `Fila: ${accounts.length} conta(s)${pronacs.length ? ` PRONAC=${pronacs.join(",")}` : ""}`,
    },
  });
}

async function accountsForSync(options: SyncOptions) {
  return prisma.salicAccount.findMany({
    where: {
      active: true,
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...(options.salicAccountId ? { id: options.salicAccountId } : {}),
      ...(!options.workspaceId && !options.salicAccountId
        ? { workspace: { plan: "PRO" as const } }
        : {}),
    },
  });
}

async function mirrorCatalogForAccounts(accounts: Array<{ workspaceId: string }>) {
  const { ensureCatalogFromAudit } = await import("@/lib/catalog/from-audit");
  const ids = [...new Set(accounts.map((a) => a.workspaceId).filter(Boolean))];
  for (const workspaceId of ids) {
    await ensureCatalogFromAudit(workspaceId);
  }
}

async function mirrorCatalogForWorkItems(items: WorkItem[]) {
  const accountIds = [...new Set(items.map((i) => i.accountId))];
  if (accountIds.length === 0) return;
  const accounts = await prisma.salicAccount.findMany({
    where: { id: { in: accountIds } },
    select: { workspaceId: true },
  });
  await mirrorCatalogForAccounts(accounts);
}

async function buildWorkState(options: SyncOptions): Promise<WorkState> {
  const forceCrawler = options.forceCrawler ?? false;
  const pronacs = (options.pronacs || []).filter(Boolean);

  if (forceCrawler) {
    return { mode: "crawler", cursor: 0, items: [], forceCrawler: true };
  }

  const accounts = await accountsForSync(options);

  const items: WorkItem[] = [];
  for (const account of accounts) {
    const resolved = await resolvePronacsForAccount({
      salicAccountId: account.id,
      pronacs: pronacs.length ? pronacs : undefined,
    });
    items.push(...resolved.items);
  }

  return { mode: "api", cursor: 0, items, forceCrawler: false };
}

/**
 * Executa sync completo (bom no notebook / worker longo).
 * Usa cache + paralelismo — mesmos dados, menos requests repetidos.
 */
export async function executeSyncRun(syncRunId: string, options: SyncOptions = {}) {
  const forceCrawler = options.forceCrawler ?? false;
  const pronacs = (options.pronacs || []).filter(Boolean);

  const claimed = await prisma.syncRun.updateMany({
    where: {
      id: syncRunId,
      status: { in: ["pending", "running"] },
    },
    data: {
      status: "running",
      startedAt: new Date(),
      progressMessage: "Iniciando (cache + paralelo)…",
    },
  });
  if (claimed.count === 0) {
    // Outro worker já pegou, ou já foi cancelada/finalizada — não marca cancelamento falso
    return prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } });
  }

  const accounts = await accountsForSync(options);

  const allLogs: string[] = [`SyncRun ${syncRunId}`];
  let projectsSynced = 0;
  let paymentsUpserted = 0;
  let hadError = false;
  let hadSuccess = false;

  const flush = async (message: string, extra?: { current?: number; total?: number }) => {
    await assertSyncStillActive(syncRunId);
    allLogs.push(message);
    await writeProgress(syncRunId, {
      progressMessage: message,
      progressCurrent: extra?.current,
      progressTotal: extra?.total,
      projectsSynced,
      paymentsUpserted,
      log: allLogs.join("\n"),
    });
  };

  try {
    for (const account of accounts) {
      await flush(`Conta ${account.name} (${formatCgccpf(account.cgccpf)})`);
      try {
        if (forceCrawler) {
          await flush("Modo forçado: crawler");
          const { syncAccountViaCrawler } = await import("@/lib/salic/crawler");
          const result = await syncAccountViaCrawler({
            salicAccountId: account.id,
            pronacs: pronacs.length ? pronacs : undefined,
            onProgress: async (m) => {
              await flush(m);
            },
          });
          projectsSynced += result.projectsSynced;
          paymentsUpserted += result.paymentsUpserted;
          if (result.paymentsDeleted) {
            allLogs.push(`pagamentosRemovidos=${result.paymentsDeleted}`);
          }
          if (result.projectsDeleted) {
            allLogs.push(`projetosRemovidos=${result.projectsDeleted}`);
          }
          hadSuccess = true;
        } else {
          const result = await syncAccountViaApi({
            salicAccountId: account.id,
            pronacs: pronacs.length ? pronacs : undefined,
            onProgress: async (m, meta) => {
              await flush(m, meta);
            },
          });
          projectsSynced += result.projectsSynced;
          paymentsUpserted += result.paymentsUpserted;
          hadSuccess = true;
          allLogs.push(...result.log);
        }
      } catch (error) {
        if (error instanceof SyncCancelledError) throw error;
        hadError = true;
        const message = error instanceof Error ? error.message : String(error);
        await flush(`Erro na conta ${account.name}: ${message}`);
      }
    }

    const status = hadError ? (hadSuccess ? "partial" : "error") : "success";
    await assertSyncStillActive(syncRunId);
    await writeProgress(syncRunId, {
      status,
      finishedAt: new Date(),
      projectsSynced,
      paymentsUpserted,
      progressMessage:
        status === "success"
          ? "Concluído"
          : status === "partial"
            ? "Concluído com avisos"
            : "Falhou",
      progressCurrent: projectsSynced,
      log: allLogs.join("\n"),
      errorMessage: hadError && !hadSuccess ? allLogs[allLogs.length - 1] : null,
      workState: null,
    });
    if (hadSuccess) {
      await mirrorCatalogForAccounts(accounts);
    }
  } catch (error) {
    if (error instanceof SyncCancelledError) {
      const current = await prisma.syncRun.findUnique({
        where: { id: syncRunId },
        select: {
          status: true,
          errorMessage: true,
          progressMessage: true,
        },
      });

      // Só reforça "Cancelada pelo usuário" se o cancelamento já veio da API/UI.
      // Corridas entre workers NÃO devem inventar cancelamento.
      if (current && (error.byUser || isUserCancelled(current))) {
        allLogs.push("Cancelada pelo usuário");
        await prisma.syncRun
          .update({
            where: { id: syncRunId },
            data: {
              projectsSynced,
              paymentsUpserted,
              log: allLogs.join("\n"),
              status: "error",
              finishedAt: new Date(),
              progressMessage: "Cancelada",
              errorMessage: "Cancelada pelo usuário",
            },
          })
          .catch(() => undefined);
      }

      return prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } });
    }
    const message = error instanceof Error ? error.message : String(error);
    try {
      await writeProgress(syncRunId, {
        status: "error",
        finishedAt: new Date(),
        projectsSynced,
        paymentsUpserted,
        progressMessage: "Falhou",
        errorMessage: message,
        log: allLogs.concat(message).join("\n"),
      });
    } catch {
      // já cancelada/finalizada
    }
  }

  return prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } });
}

/**
 * Prepara a fila e processa a primeira fatia.
 * Em Vercel, o SyncPanel chama /api/sync/tick até terminar.
 */
export async function startChunkedSync(syncRunId: string, options: SyncOptions = {}) {
  await prisma.syncRun.update({
    where: { id: syncRunId },
    data: { status: "running", startedAt: new Date(), progressMessage: "Montando fila…" },
  });

  if (options.forceCrawler) {
    // Crawler precisa de processo longo — executa de uma vez (local/worker).
    return executeSyncRun(syncRunId, options);
  }

  const workState = await buildWorkState(options);
  await writeProgress(syncRunId, {
    workState,
    progressTotal: workState.items.length,
    progressCurrent: 0,
    progressMessage: `Fila pronta: ${workState.items.length} PRONAC(s)`,
    log: `Fila: ${workState.items.length} itens`,
  });

  if (workState.items.length === 0) {
    await writeProgress(syncRunId, {
      status: "success",
      finishedAt: new Date(),
      progressMessage: "Nada a sincronizar",
    });
    return prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } });
  }

  return tickSyncRun(syncRunId);
}

/**
 * Processa 1 PRONAC por tick (ideal Vercel maxDuration ~60s).
 * Cache em memória só vale dentro do tick; o ganho maior é 1 projeto/request previsível.
 */
export async function tickSyncRun(syncRunId: string) {
  const syncRun = await prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } });
  if (syncRun.status !== "running" && syncRun.status !== "pending") {
    return { done: true as const, syncRun };
  }

  const workState = (syncRun.workState as WorkState | null) || null;
  if (!workState || workState.mode !== "api") {
    // Fallback: full run
    const result = await executeSyncRun(syncRunId, {
      salicAccountId: syncRun.salicAccountId || undefined,
      forceCrawler: syncRun.forceCrawler,
    });
    return { done: true as const, syncRun: result };
  }

  if (workState.cursor >= workState.items.length) {
    await writeProgress(syncRunId, {
      status: "success",
      finishedAt: new Date(),
      progressMessage: "Concluído",
      progressCurrent: workState.items.length,
      progressTotal: workState.items.length,
      workState: null,
    });
    await mirrorCatalogForWorkItems(workState.items);
    return {
      done: true as const,
      syncRun: await prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } }),
    };
  }

  const item = workState.items[workState.cursor];
  const logs = (syncRun.log || "").split("\n").filter(Boolean);
  logs.push(`Tick ${workState.cursor + 1}/${workState.items.length}: PRONAC ${item.pronac}`);

  await writeProgress(syncRunId, {
    progressMessage: `Sincronizando PRONAC ${item.pronac} (${workState.cursor + 1}/${workState.items.length})`,
    progressCurrent: workState.cursor,
    progressTotal: workState.items.length,
    log: logs.join("\n"),
  });

  try {
    const cache = new ProdutosCache();
    const result = await syncProjectViaApi({
      salicAccountId: item.accountId,
      pronac: item.pronac,
      projectName: item.name,
      cache,
      onProgress: async (message, meta) => {
        await writeProgress(syncRunId, {
          progressMessage: message,
          progressCurrent: meta?.current ?? workState.cursor,
          progressTotal: meta?.total ?? workState.items.length,
        });
      },
    });

    workState.cursor += 1;
    const projectsSynced = syncRun.projectsSynced + 1;
    const paymentsUpserted = syncRun.paymentsUpserted + result.paymentsUpserted;
    logs.push(
      `PRONAC ${item.pronac}: +${result.paymentsUpserted} pagamentos (${result.fornecedoresCount} fornecedores)`,
    );

    const done = workState.cursor >= workState.items.length;
    await writeProgress(syncRunId, {
      status: done ? "success" : "running",
      finishedAt: done ? new Date() : null,
      projectsSynced,
      paymentsUpserted,
      progressCurrent: workState.cursor,
      progressTotal: workState.items.length,
      progressMessage: done
        ? "Concluído"
        : `Pronto para próximo: ${workState.cursor + 1}/${workState.items.length}`,
      log: logs.join("\n"),
      workState: done ? null : workState,
    });

    if (done) {
      await mirrorCatalogForWorkItems(workState.items);
    }

    return {
      done,
      syncRun: await prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logs.push(`Erro PRONAC ${item.pronac}: ${message}`);
    // Avança o cursor para não travar a fila; marca partial no final
    workState.cursor += 1;
    const done = workState.cursor >= workState.items.length;
    await writeProgress(syncRunId, {
      status: done ? "partial" : "running",
      finishedAt: done ? new Date() : null,
      progressCurrent: workState.cursor,
      progressTotal: workState.items.length,
      progressMessage: done ? "Concluído com erros" : `Erro em ${item.pronac}; seguindo…`,
      errorMessage: message,
      log: logs.join("\n"),
      workState: done ? null : workState,
    });
    if (done) {
      await mirrorCatalogForWorkItems(workState.items);
    }
    return {
      done,
      syncRun: await prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } }),
    };
  }
}

export async function runSync(options: SyncOptions = {}) {
  const syncRun = await enqueueSync(options);
  return executeSyncRun(syncRun.id, options);
}
