import { prisma } from "@/lib/db";
import { getAccountPauseMs, getSyncConcurrency, sleep } from "@/lib/salic/concurrency";
import { enqueueSync, executeSyncRun } from "@/lib/sync/run";

export type DailySyncResult = {
  startedAt: string;
  finishedAt: string;
  accounts: number;
  concurrency: number;
  accountPauseMs: number;
  runs: Array<{
    accountId: string;
    accountName: string;
    syncRunId: string;
    mode: "crawler" | "api";
    status: string;
    projectsSynced: number;
    paymentsUpserted: number;
    errorMessage: string | null;
  }>;
};

/**
 * Sincroniza todas as contas ativas, uma por vez.
 * Prefere crawler quando há credenciais SALIC; senão usa API pública.
 * Ritmo conservador para não sobrecarregar o SALIC com vários clientes.
 */
export async function runDailySyncAllAccounts(): Promise<DailySyncResult> {
  const startedAt = new Date();
  // Ativa perfil de concorrência reduzida para o cron
  process.env.SALINK_DAILY_SYNC = "1";
  const concurrency = getSyncConcurrency();
  const accountPauseMs = getAccountPauseMs();

  const accounts = await prisma.salicAccount.findMany({
    where: {
      active: true,
      workspace: { plan: "PRO" },
    },
    orderBy: { name: "asc" },
  });

  const runs: DailySyncResult["runs"] = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]!;
    const forceCrawler = Boolean(account.salicUsernameEnc && account.salicPasswordEnc);
    const syncRun = await enqueueSync({
      salicAccountId: account.id,
      forceCrawler,
    });

    try {
      const finished = await executeSyncRun(syncRun.id, {
        salicAccountId: account.id,
        forceCrawler,
      });
      runs.push({
        accountId: account.id,
        accountName: account.name,
        syncRunId: finished.id,
        mode: forceCrawler ? "crawler" : "api",
        status: finished.status,
        projectsSynced: finished.projectsSynced,
        paymentsUpserted: finished.paymentsUpserted,
        errorMessage: finished.errorMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "error",
          finishedAt: new Date(),
          progressMessage: "Falhou (cron)",
          errorMessage: message,
        },
      });
      runs.push({
        accountId: account.id,
        accountName: account.name,
        syncRunId: syncRun.id,
        mode: forceCrawler ? "crawler" : "api",
        status: "error",
        projectsSynced: 0,
        paymentsUpserted: 0,
        errorMessage: message,
      });
    }

    // Pausa entre contas (exceto após a última)
    if (i < accounts.length - 1) {
      await sleep(accountPauseMs);
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    accounts: accounts.length,
    concurrency,
    accountPauseMs,
    runs,
  };
}
