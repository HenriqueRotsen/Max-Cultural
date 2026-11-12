/**
 * Importação dos sócios vindos da Receita (BrasilAPI) para o mapa societário.
 * Funções puras: montar os intervalos pelas datas de entrada e completar o CPF
 * mascarado com quem o sistema já conhece.
 */

export type QsaInput = {
  name: string;
  cgccpf: string;
  personType: "PF" | "PJ";
  role: "PARTNER" | "ADMINISTRATOR" | "BOTH";
  maskedCpfMiddle?: string;
  joinedAt?: Date | null;
};

export type KnownPerson = { name: string; cgccpf: string };

export function normalizePersonName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A Receita mostra o CPF do sócio como ***540203** (dígitos 4 a 9). Se houver
 * exatamente uma pessoa conhecida com o mesmo nome e esses dígitos, devolve o
 * CPF completo; senão, vazio (melhor sem CPF do que com o CPF errado).
 */
export function completeMaskedCpf(
  member: { name: string; maskedCpfMiddle?: string },
  known: KnownPerson[],
): string {
  const middle = member.maskedCpfMiddle;
  if (!middle || middle.length !== 6) return "";
  const name = normalizePersonName(member.name);
  const matches = new Set(
    known
      .map((k) => ({ name: normalizePersonName(k.name), cpf: k.cgccpf.replace(/\D/g, "") }))
      .filter((k) => k.cpf.length === 11 && k.cpf.slice(3, 9) === middle && k.name === name)
      .map((k) => k.cpf),
  );
  return matches.size === 1 ? [...matches][0]! : "";
}

export type QsaPeriod = {
  validFrom: Date;
  validTo: Date | null;
  label: string;
  members: QsaInput[];
};

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Intervalos pelas datas de entrada: cada nova entrada abre um intervalo com
 * quem já estava e quem entrou. Sem data de entrada, vale desde a abertura.
 * Quem saiu da sociedade não aparece na Receita, então os intervalos antigos
 * podem estar incompletos (o rótulo avisa).
 */
export function periodsFromQsa(qsa: QsaInput[], foundedAt: Date): QsaPeriod[] {
  if (qsa.length === 0) return [];
  const startOf = (m: QsaInput) =>
    m.joinedAt && m.joinedAt.getTime() > foundedAt.getTime() ? m.joinedAt : foundedAt;
  const starts = [...new Map(qsa.map((m) => [dayKey(startOf(m)), startOf(m)])).values()].sort(
    (a, b) => a.getTime() - b.getTime(),
  );
  return starts.map((from, i) => {
    const next = starts[i + 1];
    const last = i === starts.length - 1;
    return {
      validFrom: from,
      validTo: next ? new Date(next.getTime() - DAY) : null,
      label: last
        ? "Composição atual (Receita Federal)"
        : "Pela data de entrada (Receita) — quem saiu antes não aparece",
      members: qsa.filter((m) => startOf(m).getTime() <= from.getTime()),
    };
  });
}

export type PeriodSpan = { id: string; validFrom: Date; validTo: Date | null };
export type DatedAmount = { amount: number; paymentDate: Date | null };

/**
 * Soma os pagamentos por intervalo do mapa (quem era sócio na data do
 * pagamento). O fim do intervalo vale o dia inteiro. O que cai fora de todos
 * os intervalos, ou não tem data, vai para `outside`.
 */
export function paymentsByPeriod<T extends DatedAmount>(
  periods: PeriodSpan[],
  payments: T[],
): { byPeriod: Map<string, { count: number; total: number }>; outside: { count: number; total: number } } {
  const byPeriod = new Map(periods.map((p) => [p.id, { count: 0, total: 0 }]));
  const outside = { count: 0, total: 0 };
  for (const pay of payments) {
    // Compara por dia (AAAA-MM-DD): o fim do intervalo vale o dia inteiro.
    const day = pay.paymentDate ? dayKey(pay.paymentDate) : null;
    const hit =
      day == null
        ? undefined
        : periods.find(
            (p) => day >= dayKey(p.validFrom) && (p.validTo == null || day <= dayKey(p.validTo)),
          );
    const bucket = hit ? byPeriod.get(hit.id)! : outside;
    bucket.count += 1;
    bucket.total = Math.round((bucket.total + pay.amount) * 100) / 100;
  }
  return { byPeriod, outside };
}
