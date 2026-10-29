import { fifthBusinessDayNextMonth } from "@/lib/planning/business-days";

/** Parse YYYY-MM-DD ou ISO; meio-dia UTC para evitar drift de fuso. */
export function parseReminderDate(raw: string, fallback: Date): Date {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed,
  );
}

export function toDateInputValue(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

/** Sugestão: alguns dias antes do vencimento legal (5º dia útil). */
export function defaultPaymentReminderDate(
  expectedPayAt: Date,
  daysBefore = 3,
): string {
  const reminder = new Date(expectedPayAt);
  reminder.setUTCDate(reminder.getUTCDate() - daysBefore);
  const today = startOfTodayUtc();
  if (reminder < today) {
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return toDateInputValue(tomorrow);
  }
  return toDateInputValue(reminder);
}

export function defaultNfReminderDate(daysAfterPaid = 7): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAfterPaid);
  return toDateInputValue(d);
}

export function defaultExpectedPayFromHiredAt(
  hiredAtRaw: string | null | undefined,
): Date {
  const hiredAt = hiredAtRaw
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(hiredAtRaw)
          ? `${hiredAtRaw}T12:00:00`
          : hiredAtRaw,
      )
    : new Date();
  return fifthBusinessDayNextMonth(hiredAt);
}

function startOfTodayUtc(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Notificações visíveis: imediatas ou com scheduledFor já passado. */
export function notificationVisibleWhere(now = new Date()) {
  return {
    OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
  };
}
