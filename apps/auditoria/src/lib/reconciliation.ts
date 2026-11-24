/**
 * Captado × pago por PRONAC: em que fase o projeto está, quanto sobra ou passa
 * do captado e o que merece atenção (comprovante em duplicidade no SALIC,
 * pagamento acima do que rendimentos explicariam).
 */

export type ReconciliationStage = "execucao" | "prestacao" | "encerrado";

export const STAGE_LABEL: Record<ReconciliationStage, string> = {
  execucao: "Captando ou executando",
  prestacao: "Prestação de contas apresentada",
  encerrado: "Encerrado",
};

/** Teto de rendimento usado para "fora da curva": 1% ao mês sobre o captado. */
export const RENDIMENTO_TETO_MES = 0.01;
/** Diferença até isso (R$) é arredondamento, não conta. */
const TOLERANCIA = 1;

export type DuplicatePayment = {
  supplierName: string;
  amount: number;
  /** Vezes que o mesmo comprovante aparece. */
  times: number;
  documentNumber: string | null;
  itemName: string | null;
  paymentDate: Date | null;
};

export type ReconciliationNote = {
  level: "info" | "attention" | "critical";
  code: "DUPLICADO" | "ACIMA_FORA_DA_CURVA" | "ACIMA_RENDIMENTO" | "SALDO_A_EXECUTAR" | "SALDO_NAO_COMPROVADO" | "SALDO_ENCERRADO";
  title: string;
  detail: string;
};

export type ProjectReconciliation = {
  stage: ReconciliationStage;
  captado: number;
  pago: number;
  /** pago − captado */
  diff: number;
  /** diff / captado × 100 (null sem captado) */
  pct: number | null;
  duplicates: DuplicatePayment[];
  duplicateAmount: number;
  /** Teto de rendimento estimado no período (null sem datas). */
  rendimentoTeto: number | null;
  months: number | null;
  notes: ReconciliationNote[];
};

export function stageFromSituacao(situacao: string | null | undefined, lifecycleStatus: string | null | undefined): ReconciliationStage {
  if (lifecycleStatus === "ENCERRADO") return "encerrado";
  const s = (situacao || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (/prestacao de contas|analise financeira|analise tecnica|dilig/.test(s)) return "prestacao";
  return "execucao";
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctText = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function monthsBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
}

export function reconcileProject(params: {
  captado: number;
  pago: number;
  situacao: string | null | undefined;
  lifecycleStatus: string | null | undefined;
  /** Primeiro aporte (ou primeiro pagamento, sem aporte com data). */
  firstMoneyAt: Date | null;
  lastPaymentAt: Date | null;
  duplicates?: DuplicatePayment[];
}): ProjectReconciliation {
  const { captado, pago } = params;
  const stage = stageFromSituacao(params.situacao, params.lifecycleStatus);
  const diff = Math.round((pago - captado) * 100) / 100;
  const pct = captado > 0 ? (diff / captado) * 100 : null;
  const duplicates = params.duplicates ?? [];
  const duplicateAmount = duplicates.reduce((n, d) => n + d.amount * (d.times - 1), 0);
  const months =
    params.firstMoneyAt && params.lastPaymentAt ? monthsBetween(params.firstMoneyAt, params.lastPaymentAt) : null;
  const rendimentoTeto = months != null ? captado * RENDIMENTO_TETO_MES * months : null;
  const notes: ReconciliationNote[] = [];

  if (duplicates.length) {
    const vezes = duplicates.reduce((n, d) => n + d.times - 1, 0);
    notes.push({
      level: "attention",
      code: "DUPLICADO",
      title: `Comprovante lançado em duplicidade no SALIC (${brl(duplicateAmount)})`,
      detail: `${vezes} lançamento${vezes === 1 ? "" : "s"} repetem um comprovante já lançado: mesmo fornecedor, valor, documento, pagamento e linha do orçamento. Isso soma no "pago" sem ter saído dinheiro a mais.`,
    });
  }

  // Sem o que foi lançado em dobro, quanto passa ou sobra de fato.
  const net = diff - duplicateAmount;
  if (captado > 0 && net > TOLERANCIA) {
    const cabe = rendimentoTeto != null && net <= rendimentoTeto;
    notes.push(
      cabe
        ? {
            level: "info",
            code: "ACIMA_RENDIMENTO",
            title: `Pago ${brl(net)} acima do captado (${pctText((net / captado) * 100)})`,
            detail: `Compatível com rendimentos da aplicação da conta do projeto: em ${Math.round(months!)} meses, o captado renderia até cerca de ${brl(rendimentoTeto!)} (1% ao mês). Confira no extrato.`,
          }
        : {
            level: "critical",
            code: "ACIMA_FORA_DA_CURVA",
            title: `Pago ${brl(net)} acima do captado (${pctText((net / captado) * 100)}): fora da curva`,
            detail:
              rendimentoTeto != null
                ? `Rendimentos não explicam: em ${Math.round(months!)} meses, o captado renderia no máximo cerca de ${brl(rendimentoTeto)} (1% ao mês). Pode ter entrado dinheiro de outra fonte (saldo transferido de outro projeto, recurso próprio) ou faltar aporte no SALIC.`
                : "Sem datas de aporte e pagamento para estimar rendimentos. Pode ter entrado dinheiro de outra fonte ou faltar aporte no SALIC.",
          },
    );
  } else if (captado > 0 && net < -TOLERANCIA) {
    const saldo = -net;
    if (stage === "execucao") {
      notes.push({
        level: "info",
        code: "SALDO_A_EXECUTAR",
        title: `Saldo a executar: ${brl(saldo)} (${pctText((saldo / captado) * 100)} do captado)`,
        detail: "O projeto ainda está captando ou executando: esse dinheiro ainda pode ser gasto.",
      });
    } else if (stage === "encerrado") {
      notes.push({
        level: "info",
        code: "SALDO_ENCERRADO",
        title: `Sobraram ${brl(saldo)} (${pctText((saldo / captado) * 100)} do captado)`,
        detail: "Projeto encerrado: o saldo não gasto normalmente é devolvido ao FNC na prestação de contas.",
      });
    } else {
      notes.push({
        level: "attention",
        code: "SALDO_NAO_COMPROVADO",
        title: `Pago ${brl(saldo)} abaixo do captado (${pctText((saldo / captado) * 100)})`,
        detail: "A prestação de contas já foi apresentada: confira se o saldo foi devolvido ao FNC ou se faltam comprovantes.",
      });
    }
  }

  return { stage, captado, pago, diff, pct, duplicates, duplicateAmount, rendimentoTeto, months, notes };
}

/** Comprovante repetido: mesmo fornecedor, valor, documento, pagamento e linha do orçamento. */
export function duplicateKey(p: {
  supplierId: string;
  amount: number;
  documentNumber: string | null;
  paymentDocumentNumber: string | null;
  planilhaAprovacaoId: string | null;
}): string {
  return [p.supplierId, p.amount.toFixed(2), p.documentNumber ?? "", p.paymentDocumentNumber ?? "", p.planilhaAprovacaoId ?? ""].join("|");
}

export function findDuplicatePayments(
  rows: Array<{
    supplierId: string;
    supplierName: string;
    amount: number;
    documentNumber: string | null;
    paymentDocumentNumber: string | null;
    planilhaAprovacaoId: string | null;
    itemName: string | null;
    paymentDate: Date | null;
  }>,
): DuplicatePayment[] {
  const groups = new Map<string, { row: (typeof rows)[number]; times: number }>();
  for (const r of rows) {
    // Sem documento nem linha do orçamento não dá para afirmar que é o mesmo comprovante.
    if (!r.documentNumber && !r.planilhaAprovacaoId) continue;
    const k = duplicateKey(r);
    const g = groups.get(k);
    if (g) g.times += 1;
    else groups.set(k, { row: r, times: 1 });
  }
  return [...groups.values()]
    .filter((g) => g.times > 1)
    .map(({ row, times }) => ({
      supplierName: row.supplierName,
      amount: row.amount,
      times,
      documentNumber: row.documentNumber,
      itemName: row.itemName,
      paymentDate: row.paymentDate,
    }))
    .sort((a, b) => b.amount * (b.times - 1) - a.amount * (a.times - 1));
}
