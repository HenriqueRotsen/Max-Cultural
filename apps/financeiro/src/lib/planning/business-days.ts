/** 5º dia útil do mês seguinte à data (V1: ignora feriados). Usa Y/M/D de calendário em America/Sao_Paulo. */
export function fifthBusinessDayNextMonth(from: Date): Date {
  const parts = calendarYearMonth(from);
  // mês seguinte (monthIndex 0–11; 12 vira janeiro no nthBusinessDayOfMonth)
  return nthBusinessDayOfMonth(parts.year, parts.monthIndex + 1, 5);
}

function calendarYearMonth(from: Date): { year: number; monthIndex: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(from);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, monthIndex: month - 1 };
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
