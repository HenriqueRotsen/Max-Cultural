export type LineBalance = {
  lineId: string;
  approved: number;
  reserved: number;
  paid: number;
  available: number;
  over: boolean;
  near: boolean;
};

export type ProjectBalance = {
  totalApproved: number;
  totalReserved: number;
  totalPaid: number;
  totalAvailable: number;
  lines: Map<string, LineBalance>;
};

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/\./g, "").replace(",", ".")) || Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof v === "object") {
    const obj = v as { toNumber?: () => number; toString?: () => string };
    // Prisma Decimal / decimal.js — precisa do `this` da instância
    if (typeof obj.toNumber === "function") {
      const x = obj.toNumber();
      if (Number.isFinite(x)) return x;
    }
    const s = typeof obj.toString === "function" ? obj.toString() : String(v);
    if (s && s !== "[object Object]") {
      const x = Number(s);
      if (Number.isFinite(x)) return x;
    }
  }
  return 0;
}

/**
 * reserved = soma RESERVED|PAID; available = approved - reserved (modo normal).
 * near = ≥80% do aprovado e ainda abaixo do limite (20% abaixo do teto).
 * over = ≥100% do aprovado (no limite ou estourado).
 */
export function computeProjectBalance(input: {
  lines: Array<{ id: string; approvedAmount: unknown }>;
  commitments: Array<{
    budgetLineId: string;
    amount: unknown;
    status: string;
  }>;
  /** Fração do aprovado a partir da qual a linha fica “próxima” (laranja). Default 0.8. */
  nearPct?: number;
}): ProjectBalance {
  const nearPct = input.nearPct ?? 0.8;
  const lines = new Map<string, LineBalance>();
  let totalApproved = 0;
  let totalReserved = 0;
  let totalPaid = 0;

  for (const line of input.lines) {
    const approved = n(line.approvedAmount);
    totalApproved += approved;
    lines.set(line.id, {
      lineId: line.id,
      approved,
      reserved: 0,
      paid: 0,
      available: approved,
      over: false,
      near: false,
    });
  }

  for (const c of input.commitments) {
    if (c.status === "CANCELLED") continue;
    const bal = lines.get(c.budgetLineId);
    if (!bal) continue;
    const amount = n(c.amount);
    bal.reserved += amount;
    totalReserved += amount;
    if (c.status === "PAID") {
      bal.paid += amount;
      totalPaid += amount;
    }
  }

  for (const bal of lines.values()) {
    bal.available = bal.approved - bal.reserved;
    // Aprovado 0 = já no limite (nada a gastar). Caso contrário, ≥100% do aprovado.
    bal.over =
      bal.approved <= 0 || bal.reserved >= bal.approved - 1e-9;
    bal.near =
      !bal.over && bal.reserved >= bal.approved * nearPct - 1e-9;
  }

  return {
    totalApproved,
    totalReserved,
    totalPaid,
    totalAvailable: totalApproved - totalReserved,
    lines,
  };
}

export type ReserveCheckResult =
  | { ok: true; overflow: boolean }
  | { ok: false; message: string };

/**
 * Valida reserva. Com allowOverflow: linha ≤ 2× aprovado e projeto ≤ total aprovado.
 */
export function canReserveAmount(params: {
  lineId: string;
  amount: number;
  balance: ProjectBalance;
  allowOverflow: boolean;
}): ReserveCheckResult {
  const amount = params.amount;
  if (!(amount > 0)) {
    return { ok: false, message: "Valor da NF deve ser maior que zero" };
  }
  const line = params.balance.lines.get(params.lineId);
  if (!line) {
    return { ok: false, message: "Rubrica não encontrada" };
  }

  const nextLineReserved = line.reserved + amount;
  const nextProjectReserved = params.balance.totalReserved + amount;

  if (!params.allowOverflow) {
    if (amount > line.available + 1e-6) {
      return {
        ok: false,
        message: `Saldo insuficiente nesta rubrica (disponível R$ ${line.available.toFixed(2)})`,
      };
    }
    return { ok: true, overflow: false };
  }

  if (nextLineReserved > line.approved * 2 + 1e-6) {
    return {
      ok: false,
      message: `Excesso acima de 100% da rubrica (máx. R$ ${(line.approved * 2).toFixed(2)})`,
    };
  }
  if (nextProjectReserved > params.balance.totalApproved + 1e-6) {
    return {
      ok: false,
      message: `Total do projeto excederia o orçamento aprovado (R$ ${params.balance.totalApproved.toFixed(2)})`,
    };
  }
  return { ok: true, overflow: nextLineReserved > line.approved + 1e-6 };
}
