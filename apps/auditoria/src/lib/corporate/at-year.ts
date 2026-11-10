/** Composição do mapa vigente num período (lembrete do mapa no detalhe do PRONAC). */

type PeriodLike = { validFrom: Date; validTo: Date | null };

/** Intervalos que tocam os anos `fromYear`..`toYear` (inteiros), do mais antigo ao mais recente. */
export function periodsInYears<T extends PeriodLike>(
  periods: T[],
  fromYear: number,
  toYear: number = fromYear,
): T[] {
  const start = Date.UTC(Math.min(fromYear, toYear), 0, 1);
  const end = Date.UTC(Math.max(fromYear, toYear), 11, 31, 23, 59, 59);
  return periods
    .filter((p) => p.validFrom.getTime() <= end && (!p.validTo || p.validTo.getTime() >= start))
    .sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
}

/** Intervalos que tocam o ano (1º/jan a 31/dez), do mais antigo ao mais recente. */
export function periodsInYear<T extends PeriodLike>(periods: T[], year: number): T[] {
  return periodsInYears(periods, year, year);
}

export type MapWindow = {
  fromYear: number;
  toYear: number;
  /** "2024" ou "2023–2024". */
  label: string;
  /** De onde veio o período (texto para a tela e o PDF). */
  basis: string;
};

/**
 * Anos do mapa societário que importam para o vínculo de um PRONAC: os anos dos
 * pagamentos (quando as contratações aconteceram) — a mesma base de datas da escolha
 * da IN. Sem pagamentos com data, vale o ano do PRONAC (dois primeiros dígitos).
 */
export function mapWindowForProject(params: {
  pronacYear: number;
  firstPayment?: Date | null;
  lastPayment?: Date | null;
}): MapWindow {
  const first = params.firstPayment ?? params.lastPayment ?? null;
  const last = params.lastPayment ?? params.firstPayment ?? null;
  if (first && last) {
    const fromYear = Math.min(first.getUTCFullYear(), last.getUTCFullYear());
    const toYear = Math.max(first.getUTCFullYear(), last.getUTCFullYear());
    return {
      fromYear,
      toYear,
      label: fromYear === toYear ? String(fromYear) : `${fromYear}–${toYear}`,
      basis: "período dos pagamentos",
    };
  }
  return {
    fromYear: params.pronacYear,
    toYear: params.pronacYear,
    label: String(params.pronacYear),
    basis: "ano do PRONAC (ainda sem pagamentos)",
  };
}
