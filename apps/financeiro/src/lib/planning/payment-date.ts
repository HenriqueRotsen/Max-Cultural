/**
 * Data do pagamento: vem do comprovante e não é mais "hoje" por padrão.
 * - Lida no comprovante: é ela que vale. Se a pessoa também digitou uma data
 *   diferente, bloqueia (alguém está enganado).
 * - Não lida: a pessoa precisa informar a data.
 * - Nunca no futuro.
 * - Quando há NF com data de emissão (fluxo normal), não pode ser antes dela.
 *   No pagamento sem NF a nota vem depois, então essa regra não se aplica.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function isoDay(value: string | null | undefined): string | null {
  const m = ISO_DAY.exec(String(value || "").trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function br(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** Hoje no fuso de Brasília, como AAAA-MM-DD. */
export function todayBrt(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function resolvePaymentDate(params: {
  /** Data lida no comprovante (AAAA-MM-DD…), se houver. */
  extracted: string | null | undefined;
  /** Data digitada no formulário (AAAA-MM-DD), se houver. */
  typed: string | null | undefined;
  /** Emissão da NF/RPA (AAAA-MM-DD), quando o pagamento vem depois da nota. */
  nfDate?: string | null;
  today?: string;
}): { date: Date } | { error: string } {
  const extracted = isoDay(params.extracted);
  const typed = isoDay(params.typed);
  if (extracted && typed && extracted !== typed) {
    return {
      error: `A data do comprovante (${br(extracted)}) é diferente da data informada (${br(typed)}). Confira qual está certa.`,
    };
  }
  const day = extracted ?? typed;
  if (!day) {
    return {
      error:
        "Não foi possível ler a data do pagamento no comprovante. Informe a data do pagamento.",
    };
  }
  const today = params.today ?? todayBrt();
  if (day > today) {
    return { error: `A data do pagamento (${br(day)}) está no futuro.` };
  }
  const nfDate = isoDay(params.nfDate);
  if (nfDate && day < nfDate) {
    return {
      error: `O pagamento (${br(day)}) é anterior à emissão da NF/RPA (${br(nfDate)}). Pagamento antes da nota deve ser registrado como "Pagamento sem NF".`,
    };
  }
  return { date: new Date(`${day}T12:00:00Z`) };
}
