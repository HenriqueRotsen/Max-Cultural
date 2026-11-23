/**
 * Valor de cada rubrica no rateio. A pessoa pode digitar o valor em reais
 * (vale como está) ou só a porcentagem; nesse caso a última rubrica fica com os
 * centavos do arredondamento, para a soma sempre fechar com o total.
 */
export type AllocationInput = { budgetLineId: string; sharePct: number; amount?: number | null };

const cents = (n: number) => Math.round(n * 100) / 100;

export function parseAllocationsJson(raw: string): AllocationInput[] | null {
  try {
    const list = JSON.parse(raw || "[]") as Array<{ budgetLineId?: unknown; sharePct?: unknown; amount?: unknown }>;
    if (!Array.isArray(list)) return null;
    return list
      .map((a) => {
        const amount = a.amount != null && a.amount !== "" ? Number(a.amount) : null;
        return {
          budgetLineId: String(a.budgetLineId || ""),
          sharePct: Math.round(Number(a.sharePct) * 10000) / 10000,
          amount: amount != null && Number.isFinite(amount) && amount > 0 ? cents(amount) : null,
        };
      })
      .filter((a) => a.budgetLineId && (a.sharePct > 0 || (a.amount ?? 0) > 0));
  } catch {
    return null;
  }
}

/**
 * Valores em reais de cada rubrica para o total `gross`. Com valores digitados
 * em todas as linhas, eles precisam somar o total; a porcentagem é recalculada.
 */
export function allocationAmounts(
  allocs: AllocationInput[],
  gross: number,
): { ok: true; slices: Array<{ budgetLineId: string; sharePct: number; amount: number }> } | { ok: false; error: string } {
  if (!allocs.length) return { ok: false, error: "Informe ao menos uma rubrica no rateio" };
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const typed = allocs.every((a) => (a.amount ?? 0) > 0);
  if (typed) {
    const sum = cents(allocs.reduce((s, a) => s + (a.amount ?? 0), 0));
    if (Math.abs(sum - gross) > 0.01) {
      return {
        ok: false,
        error: `A soma das rubricas (${brl(sum)}) precisa ser igual ao total (${brl(gross)}). Diferença: ${brl(cents(gross - sum))}.`,
      };
    }
    return {
      ok: true,
      slices: allocs.map((a) => ({
        budgetLineId: a.budgetLineId,
        amount: a.amount!,
        sharePct: gross > 0 ? Math.round(((a.amount! / gross) * 100) * 10000) / 10000 : 0,
      })),
    };
  }
  const shareSum = allocs.reduce((s, a) => s + a.sharePct, 0);
  if (Math.abs(shareSum - 100) > 0.05) {
    return { ok: false, error: `A soma dos percentuais deve ser 100% (atual: ${shareSum.toFixed(2)}%)` };
  }
  let used = 0;
  const slices = allocs.map((a, i) => {
    const amount = i === allocs.length - 1 ? cents(gross - used) : cents((gross * a.sharePct) / 100);
    used = cents(used + amount);
    return { budgetLineId: a.budgetLineId, sharePct: a.sharePct, amount };
  });
  return { ok: true, slices };
}
