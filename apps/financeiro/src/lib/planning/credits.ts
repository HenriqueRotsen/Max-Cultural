/**
 * Créditos: pagamento feito sem nota, ainda sem rubrica. Funções puras (sem
 * banco) para o saldo do crédito, o quanto falta pagar da nota e o rateio de
 * cada uso nas rubricas da nota.
 */

const cents = (v: number) => Math.round(v * 100) / 100;
/** Diferença de centavos que ainda conta como "fechou". */
export const CREDIT_TOLERANCE = 0.02;

/** Quanto ainda dá para usar do crédito. */
export function creditRemaining(amount: number, uses: Array<{ amount: number }>): number {
  return cents(amount - uses.reduce((s, u) => s + u.amount, 0));
}

/** Quanto falta pagar da nota, descontado o que já foi pago com créditos. */
export function fiscalRemaining(expected: number, paidWithCredits: number): number {
  return Math.max(0, cents(expected - paidWithCredits));
}

/** Valor sugerido ao usar o crédito: o menor entre o saldo e o que falta da nota. */
export function suggestedCreditUse(creditLeft: number, nfLeft: number): number {
  return cents(Math.max(0, Math.min(creditLeft, nfLeft)));
}

export function validateCreditUse(params: {
  amount: number;
  creditLeft: number;
  nfLeft: number;
}): string | null {
  const { amount, creditLeft, nfLeft } = params;
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (!(amount > 0)) return "Informe quanto usar do crédito.";
  if (amount > creditLeft + 0.005) {
    return `O crédito só tem ${brl(creditLeft)} disponíveis.`;
  }
  if (nfLeft <= 0.005) return "Esta nota já está paga.";
  if (amount > nfLeft + CREDIT_TOLERANCE) {
    return `Falta pagar só ${brl(nfLeft)} desta nota.`;
  }
  return null;
}

/**
 * Divide o valor do uso nas rubricas da nota, na mesma proporção. O último
 * pedaço absorve os centavos que sobram, para a soma fechar no valor do uso.
 */
export function scaleAllocationsToAmount<T extends { amount: number }>(
  allocs: T[],
  useAmount: number,
): Array<T & { amount: number }> {
  const total = allocs.reduce((s, a) => s + a.amount, 0);
  if (allocs.length === 0 || !(total > 0)) return [];
  let used = 0;
  return allocs.map((a, i) => {
    const amount =
      i === allocs.length - 1 ? cents(useAmount - used) : cents((a.amount / total) * useAmount);
    used = cents(used + amount);
    return { ...a, amount };
  });
}
