/** Datas com precisão dia / mês / ano para o mapa do proponente. */

export type DatePrecisionValue = "DAY" | "MONTH" | "YEAR";

export function normalizePrecisionDate(
  year: number,
  month?: number,
  day?: number,
  precision: DatePrecisionValue = "DAY",
): Date {
  if (precision === "YEAR") {
    return new Date(Date.UTC(year, 0, 1, 12, 0, 0));
  }
  if (precision === "MONTH") {
    return new Date(Date.UTC(year, (month || 1) - 1, 1, 12, 0, 0));
  }
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0));
}

export function formatPrecisionDate(
  value: Date | string | null | undefined,
  precision: DatePrecisionValue = "DAY",
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (precision === "YEAR") return String(y);
  if (precision === "MONTH") {
    const months = [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ];
    return `${months[m - 1]}/${y}`;
  }
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function parsePrecisionForm(params: {
  precision: string;
  year: string;
  month?: string;
  day?: string;
}): { date: Date; precision: DatePrecisionValue } | null {
  const precision = (params.precision || "DAY").toUpperCase() as DatePrecisionValue;
  const year = Number(params.year);
  if (!Number.isFinite(year) || year < 1800 || year > 2100) return null;
  if (precision === "YEAR") {
    return { date: normalizePrecisionDate(year, 1, 1, "YEAR"), precision };
  }
  const month = Number(params.month || 1);
  if (month < 1 || month > 12) return null;
  if (precision === "MONTH") {
    return { date: normalizePrecisionDate(year, month, 1, "MONTH"), precision };
  }
  const day = Number(params.day || 1);
  if (day < 1 || day > 31) return null;
  return { date: normalizePrecisionDate(year, month, day, "DAY"), precision: "DAY" };
}

export function assertNotBeforeFounded(
  value: Date,
  foundedAt: Date | null | undefined,
): string | null {
  if (!foundedAt) return null;
  if (value.getTime() < foundedAt.getTime()) {
    return "A data não pode ser anterior à abertura da empresa";
  }
  return null;
}
