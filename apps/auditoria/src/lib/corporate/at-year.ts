/** Composição do mapa vigente em um ano (atalho do detalhe do PRONAC). */

type PeriodLike = { validFrom: Date; validTo: Date | null };

/** Intervalos que tocam o ano (1º/jan a 31/dez), do mais antigo ao mais recente. */
export function periodsInYear<T extends PeriodLike>(periods: T[], year: number): T[] {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year, 11, 31, 23, 59, 59);
  return periods
    .filter((p) => p.validFrom.getTime() <= end && (!p.validTo || p.validTo.getTime() >= start))
    .sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
}
