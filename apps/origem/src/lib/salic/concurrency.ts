/** Limite de concorrência para chamadas à API SALIC. */
export function getSyncConcurrency(): number {
  // Cron diário / multi-cliente: perfil mais conservador
  const cronRaw = process.env.SYNC_CRON_CONCURRENCY;
  const useCronProfile = process.env.SALINK_DAILY_SYNC === "1";
  const fallback = useCronProfile ? 2 : 4;
  const raw = Number(
    useCronProfile && cronRaw
      ? cronRaw
      : process.env.SYNC_CONCURRENCY || String(fallback),
  );
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  const cap = useCronProfile ? 3 : 8;
  return Math.min(cap, Math.floor(raw));
}

export function getAccountPauseMs(): number {
  const raw = Number(process.env.SYNC_ACCOUNT_PAUSE_MS || "5000");
  if (!Number.isFinite(raw) || raw < 0) return 5000;
  return Math.min(120_000, Math.floor(raw));
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };

/** Executa tasks com no máximo `concurrency` em paralelo. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => run()));
  return results;
}
