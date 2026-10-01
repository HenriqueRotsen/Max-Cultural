/** Links de aviso de pagamento → Contas a pagar (com fallback legado ao compromisso). */

export function paymentAlertHref(
  commitmentId: string,
  due: "overdue" | "upcoming",
): string {
  const qs = new URLSearchParams({ due, c: commitmentId });
  return `/planejamento/contas-a-pagar?${qs.toString()}`;
}

/** Todos os hrefs possíveis de um compromisso (legado + contas a pagar). */
export function paymentAlertHrefsForCommitment(commitmentId: string): string[] {
  return [
    `/planejamento/compromissos/${commitmentId}`,
    paymentAlertHref(commitmentId, "overdue"),
    paymentAlertHref(commitmentId, "upcoming"),
  ];
}

export function summarizePaymentDeadlines(
  rows: Array<{ expectedPayAt: string | Date; amount: number }>,
  opts: { dueSoonDays: number; now?: Date },
) {
  const now = opts.now ?? new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + Math.max(1, opts.dueSoonDays));

  let overdueCount = 0;
  let overdueAmount = 0;
  let upcomingCount = 0;
  let upcomingAmount = 0;

  for (const row of rows) {
    const due = new Date(row.expectedPayAt);
    due.setHours(0, 0, 0, 0);
    if (due < today) {
      overdueCount += 1;
      overdueAmount += row.amount;
    } else if (due <= horizon) {
      upcomingCount += 1;
      upcomingAmount += row.amount;
    }
  }

  return {
    overdueCount,
    overdueAmount,
    upcomingCount,
    upcomingAmount,
    dueSoonDays: Math.max(1, opts.dueSoonDays),
  };
}
