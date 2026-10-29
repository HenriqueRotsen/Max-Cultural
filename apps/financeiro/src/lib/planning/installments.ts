/** Limites do gerador de parcelas no Pedido. */
export const INSTALLMENT_COUNT_MIN = 2;
export const INSTALLMENT_COUNT_MAX = 36;

export type InstallmentSplit = {
  amount: number;
  /** YYYY-MM-DD */
  expectedPayAt: string;
};

/** Soma N meses a uma data civil YYYY-MM-DD, clampando o dia no fim do mês. */
export function addMonthsYmd(ymd: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) throw new Error("Data inválida (use YYYY-MM-DD)");
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  const base = new Date(Date.UTC(year, monthIndex + months, 1));
  const y = base.getUTCFullYear();
  const mo = base.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Divide o total em N parcelas iguais (centavos na última) com vencimentos
 * mensais a partir de `firstDate` (YYYY-MM-DD).
 */
export function splitInstallments(
  totalAmount: number,
  count: number,
  firstDate: string,
): InstallmentSplit[] {
  if (!(totalAmount > 0) || !Number.isFinite(totalAmount)) {
    throw new Error("Valor total inválido");
  }
  if (
    !Number.isInteger(count) ||
    count < INSTALLMENT_COUNT_MIN ||
    count > INSTALLMENT_COUNT_MAX
  ) {
    throw new Error(
      `Quantidade de parcelas deve ser entre ${INSTALLMENT_COUNT_MIN} e ${INSTALLMENT_COUNT_MAX}`,
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate.trim())) {
    throw new Error("Data da 1ª parcela inválida");
  }

  const cents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(cents / count);
  const remainder = cents - baseCents * count;

  const out: InstallmentSplit[] = [];
  for (let i = 0; i < count; i++) {
    const amountCents = i === count - 1 ? baseCents + remainder : baseCents;
    out.push({
      amount: amountCents / 100,
      expectedPayAt: addMonthsYmd(firstDate.trim(), i),
    });
  }
  return out;
}
