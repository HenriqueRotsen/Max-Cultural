/** Próximo n-ésimo dia útil a partir do mês seguinte à data (V1: ignora feriados). */
export function fifthBusinessDayNextMonth(from: Date): Date {
  return nthBusinessDayOfMonth(from.getFullYear(), from.getMonth() + 1, 5);
}

export function nthBusinessDayOfMonth(
  year: number,
  monthIndex: number,
  n: number,
): Date {
  // monthIndex pode ser 12 → janeiro do ano seguinte
  let y = year;
  let m = monthIndex;
  if (m > 11) {
    y += Math.floor(m / 12);
    m = m % 12;
  }
  let count = 0;
  let day = 1;
  while (count < n && day <= 31) {
    const d = new Date(Date.UTC(y, m, day, 12, 0, 0));
    if (d.getUTCMonth() !== m) break;
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      count += 1;
      if (count === n) return d;
    }
    day += 1;
  }
  return new Date(Date.UTC(y, m, Math.min(day, 28), 12, 0, 0));
}
