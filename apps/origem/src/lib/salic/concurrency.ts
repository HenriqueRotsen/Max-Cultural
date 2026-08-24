/** Limite de concorrência para chamadas à API SALIC. */
export function getSyncConcurrency(): number {
  const fallback = 4;
  const raw = Number(process.env.SYNC_CONCURRENCY || String(fallback));
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(8, Math.floor(raw));
}

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
