export type LineBalance = {
  lineId: string;
  approved: number;
  /** Teto operacional (aprovado × fator de captura). */
  availableCap: number;
  reserved: number;
  paid: number;
  /** Comprovado no SALIC (VlComprovado / sync relação pagamentos). */
  salicComprovado: number;
  /** Saldo operacional = availableCap − reserved. */
  available: number;
  isAdmin: boolean;
  /** Estourou o aprovado MinC. */
  overApproved: boolean;
  /** Estourou o disponível operacional. */
  over: boolean;
  near: boolean;
};

export type ProjectBalance = {
  totalApproved: number;
  totalAvailableCap: number;
  totalReserved: number;
  totalPaid: number;
  totalAvailable: number;
  pctCaptadoT: number;
  pctCaptadoOnly: number;
  operableBase: number;
  valorCaptado: number;
  lines: Map<string, LineBalance>;
};

export function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/\./g, "").replace(",", ".")) || Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof v === "object") {
    const obj = v as { toNumber?: () => number; toString?: () => string };
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

/** Produto Administração (SALIC) — não permite excesso sobre o disponível. */
export function isAdminProduct(productName: string | null | undefined): boolean {
  return /administra/i.test(String(productName || ""));
}

export function computeCaptacaoFactors(input: {
  totalApproved: number;
  valorCaptado?: unknown;
  captadoRecebido?: unknown;
  captadoTransferido?: unknown;
  rendimentos?: unknown;
}): {
  valorCaptado: number;
  operableBase: number;
  pctCaptadoT: number;
  pctCaptadoOnly: number;
} {
  const totalApproved = Math.max(0, n(input.totalApproved));
  const valorCaptado = Math.max(0, n(input.valorCaptado));
  const recebido = Math.max(0, n(input.captadoRecebido));
  const transferido = Math.max(0, n(input.captadoTransferido));
  const rendimentos = Math.max(0, n(input.rendimentos));
  const operableBase = Math.max(0, valorCaptado + recebido + rendimentos - transferido);
  const hasCaptacaoSignal =
    valorCaptado > 0 || recebido > 0 || rendimentos > 0 || transferido > 0;
  // Sem dados de captação ainda: disponível = aprovado (100%), para não zerar o operacional.
  const pctCaptadoT =
    totalApproved > 0
      ? hasCaptacaoSignal
        ? operableBase / totalApproved
        : 1
      : 0;
  const pctCaptadoOnly =
    totalApproved > 0
      ? hasCaptacaoSignal
        ? valorCaptado / totalApproved
        : 1
      : 0;
  return { valorCaptado, operableBase, pctCaptadoT, pctCaptadoOnly };
}

/**
 * Saldo operacional das rubricas de produção usa aprovado × %Captado(T).
 * Administração usa 100% do aprovado MinC (sem redução pela captação).
 */
export function computeProjectBalance(input: {
  lines: Array<{
    id: string;
    approvedAmount: unknown;
    productName?: string | null;
    salicComprovado?: unknown;
  }>;
  commitments: Array<{
    budgetLineId: string;
    amount: unknown;
    status: string;
  }>;
  valorCaptado?: unknown;
  captadoRecebido?: unknown;
  captadoTransferido?: unknown;
  rendimentos?: unknown;
  /** Fração do disponível a partir da qual a linha fica “próxima”. Default 0.8. */
  nearPct?: number;
  /**
   * Valor local já refletido no SALIC (por linha), para calcular o gap
   * salicComprovado − publicado sem double-count.
   */
  publishedPaidByLine?: Map<string, number> | Record<string, number>;
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
      availableCap: approved,
      reserved: 0,
      paid: 0,
      salicComprovado: Math.max(0, n(line.salicComprovado)),
      available: approved,
      isAdmin: isAdminProduct(line.productName),
      overApproved: false,
      over: false,
      near: false,
    });
  }

  const factors = computeCaptacaoFactors({
    totalApproved,
    valorCaptado: input.valorCaptado,
    captadoRecebido: input.captadoRecebido,
    captadoTransferido: input.captadoTransferido,
    rendimentos: input.rendimentos,
  });

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

  // Gap do SALIC ainda sem reserva local publicada: evita double-count.
  const publishedLookup = (lineId: string): number => {
    if (!input.publishedPaidByLine) return 0;
    if (input.publishedPaidByLine instanceof Map) {
      return n(input.publishedPaidByLine.get(lineId));
    }
    return n(input.publishedPaidByLine[lineId]);
  };

  for (const bal of lines.values()) {
    const salicPaid = bal.salicComprovado;
    if (!(salicPaid > 0)) continue;
    const publishedLocal = publishedLookup(bal.lineId);
    const salicOnly = Math.max(0, salicPaid - publishedLocal);
    if (!(salicOnly > 0)) continue;
    bal.reserved += salicOnly;
    bal.paid += salicOnly;
    totalReserved += salicOnly;
    totalPaid += salicOnly;
  }

  let totalAvailableCap = 0;
  for (const bal of lines.values()) {
    bal.availableCap = bal.isAdmin
      ? bal.approved
      : bal.approved * factors.pctCaptadoT;
    totalAvailableCap += bal.availableCap;
    bal.available = bal.availableCap - bal.reserved;
    bal.overApproved =
      bal.approved <= 0 || bal.reserved >= bal.approved - 1e-9;
    bal.over =
      bal.availableCap <= 0 || bal.reserved >= bal.availableCap - 1e-9;
    bal.near =
      !bal.over && bal.reserved >= bal.availableCap * nearPct - 1e-9;
  }

  return {
    totalApproved,
    totalAvailableCap,
    totalReserved,
    totalPaid,
    totalAvailable: totalAvailableCap - totalReserved,
    pctCaptadoT: factors.pctCaptadoT,
    pctCaptadoOnly: factors.pctCaptadoOnly,
    operableBase: factors.operableBase,
    valorCaptado: factors.valorCaptado,
    lines,
  };
}

export type ReserveCheckResult =
  | { ok: true; overflow: boolean }
  | { ok: false; message: string };

/**
 * Reserva usa saldo disponível.
 * Admin: nunca overflow.
 * allowOverflow (demais): até 2× aprovado e projeto ≤ total aprovado.
 */
export function canReserveAmount(params: {
  lineId: string;
  amount: number;
  balance: ProjectBalance;
  allowOverflow: boolean;
}): ReserveCheckResult {
  const amount = params.amount;
  if (!(amount > 0)) {
    return { ok: false, message: "Valor deve ser maior que zero" };
  }
  const line = params.balance.lines.get(params.lineId);
  if (!line) {
    return { ok: false, message: "Rubrica não encontrada" };
  }

  const nextLineReserved = line.reserved + amount;
  const nextProjectReserved = params.balance.totalReserved + amount;

  if (line.isAdmin) {
    if (amount > line.available + 1e-6) {
      return {
        ok: false,
        message: `Administração não pode exceder o disponível (R$ ${line.available.toFixed(2)})`,
      };
    }
    return { ok: true, overflow: false };
  }

  if (!params.allowOverflow) {
    if (amount > line.available + 1e-6) {
      return {
        ok: false,
        message: `Saldo insuficiente nesta rubrica (disponível R$ ${line.available.toFixed(2)})`,
      };
    }
    return { ok: true, overflow: false };
  }

  // Overflow ACL: teto é aprovado (não disponível)
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
