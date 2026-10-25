import { formatCurrency, normalizeCgccpf } from "@/lib/crypto";
import {
  DEFAULT_RULES,
  rulesToRouanetShape,
  type ActiveRules,
} from "@/lib/compliance/defaults";

function sharePercent(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return (part / total) * 100;
}

function formatPercent(part: number, total: number, digits = 4): string {
  return `${sharePercent(part, total).toFixed(digits).replace(".", ",")}%`;
}

function pctLabel(percent: number) {
  return `${percent.toFixed(4).replace(".", ",")}%`;
}

/** @deprecated Prefer getActiveRules(); mantido para imports síncronos de fallback. */
export const ROUANET_IN = rulesToRouanetShape(DEFAULT_RULES);

export type ComplianceLevel = "info" | "attention" | "critical";

export type ComplianceAlert = {
  level: ComplianceLevel;
  code: string;
  title: string;
  detail: string;
  pronac?: string;
  supplierName?: string;
  percent?: number;
  amount?: number;
  limitPct: number;
  /** IN usada neste alerta (por projeto). */
  sourceCode?: string;
  /** Membros do teto art. 23 §1º (proponente + relacionados). */
  members?: Array<{
    name: string;
    cgccpf: string;
    amount: number;
    percent: number;
    role: "proponent" | "related";
  }>;
};

export type RelatedPartyInput = {
  cgccpf: string;
  name: string;
  /** Se omitido, usa relationRules da IN + relation */
  countsTowardProponentCap?: boolean;
  artisticGroupException?: boolean;
  relation?: string;
};

export type PersonTypeInput = "PJ" | "PF" | "MEI";

export function proponentLimitPct(rules: ActiveRules, personType?: PersonTypeInput | null) {
  if (personType === "PF" || personType === "MEI") {
    return rules.caps.proponentMeiCapPct;
  }
  return rules.caps.proponentCapPct;
}

/**
 * Faixa “perto do limite”: 20% abaixo do teto aplicável da IN.
 * Ex.: limite 20% → amarelo/laranja a partir de 16%; limite 50% → a partir de 40%.
 */
export function nearThresholdForLimit(
  limitPct: number,
  _rules: ActiveRules = DEFAULT_RULES,
): number {
  if (limitPct <= 0) return 0;
  return limitPct * 0.8;
}

export function isNearLimit(
  percent: number,
  limitPct: number,
  rules: ActiveRules = DEFAULT_RULES,
): boolean {
  if (percent > limitPct) return false;
  return percent >= nearThresholdForLimit(limitPct, rules);
}

export function legalBasisNote(rules: ActiveRules = DEFAULT_RULES) {
  const c = rules.caps;
  return `Limites conforme ${rules.sourceCode}: o mesmo fornecedor pode receber até ${c.supplierCapPct}% do valor captado do projeto (${c.articles.supplier}). A remuneração do proponente pode chegar a ${c.proponentCapPct}% (${c.articles.proponent}), ou ${c.proponentMeiCapPct}% se for pessoa física ou MEI. Pagamentos a cônjuge, sócio ou empresa ligada entram no limite do proponente (${c.articles.proponent}). No MAX Origem, os percentuais usam o valor captado do SALIC (não a soma dos comprovados).`;
}

function isSameCgccpf(a: string, b: string) {
  return normalizeCgccpf(a) === normalizeCgccpf(b);
}

/**
 * Itens de alimentação/refeição não entram na soma do vínculo art. 23.
 * (continuam nos totais gerais e no teto individual de fornecedor.)
 * “Hospedagem sem alimentação” e similares NÃO são excluídos.
 */
export function isExcludedFromBondItem(itemName: string | null | undefined): boolean {
  if (!itemName) return false;
  const n = itemName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // Negação explícita: diária/hospedagem sem alimentação entra no vínculo
  if (
    /\bsem\s+alimentac(ao|oes)\b/.test(n) ||
    /\bsem\s+refeic(ao|oes)\b/.test(n)
  ) {
    return false;
  }
  return (
    /\balimentac(ao|oes)\b/.test(n) ||
    /\brefeic(ao|oes)\b/.test(n)
  );
}

/** Agrega pagamentos elegíveis ao vínculo art. 23 (exclui alimentação/refeição). */
export function aggregateBondEligibleSuppliers(
  payments: Array<{
    amount: number;
    itemName?: string | null;
    supplier: { name: string; cgccpf: string };
  }>,
): Array<{ name: string; cgccpf: string; total: number }> {
  const map = new Map<string, { name: string; cgccpf: string; total: number }>();
  for (const p of payments) {
    if (isExcludedFromBondItem(p.itemName)) continue;
    const dig = normalizeCgccpf(p.supplier.cgccpf);
    if (!dig) continue;
    const cur = map.get(dig) || {
      name: p.supplier.name,
      cgccpf: dig,
      total: 0,
    };
    cur.total += Number(p.amount) || 0;
    if (p.supplier.name) cur.name = p.supplier.name;
    map.set(dig, cur);
  }
  return Array.from(map.values()).filter((s) => s.total > 0);
}

/** Parte relacionada entra no teto do proponente (ObservadoBond ou legado tipado). */
export function relatedPartyCountsTowardCap(
  party: RelatedPartyInput,
  rules: ActiveRules,
): boolean {
  if (party.artisticGroupException && rules.caps.relationRules.artisticGroupException) {
    return false;
  }
  if (party.countsTowardProponentCap === false) return false;
  // Novo modelo: vínculo on/off explícito
  if (party.countsTowardProponentCap === true) return true;
  if (party.relation && rules.caps.relationRules?.countsTowardProponentCap) {
    return rules.caps.relationRules.countsTowardProponentCap.includes(
      party.relation as never,
    );
  }
  return false;
}

export type ProponentGroupMember = {
  name: string;
  cgccpf: string;
  amount: number;
  percent: number;
  role: "proponent" | "related";
};

export type ProponentGroupShare = {
  members: ProponentGroupMember[];
  amount: number;
  percent: number;
  limitPct: number;
  relatedCount: number;
};

/** Soma só proponente + fornecedores enquadrados no art. 23 da IN do projeto. */
export function computeProponentGroupShare(params: {
  projectTotal: number;
  accountCgccpf?: string | null;
  personType?: PersonTypeInput | null;
  suppliers: Array<{ name: string; cgccpf: string; total: number }>;
  relatedParties?: RelatedPartyInput[];
  rules?: ActiveRules;
}): ProponentGroupShare | null {
  const rules = params.rules || DEFAULT_RULES;
  const { projectTotal } = params;
  if (projectTotal <= 0) return null;

  const related = (params.relatedParties || []).filter((r) =>
    relatedPartyCountsTowardCap(r, rules),
  );
  const relatedSet = new Set(related.map((r) => normalizeCgccpf(r.cgccpf)));

  const members: ProponentGroupMember[] = [];
  for (const s of params.suppliers) {
    const dig = normalizeCgccpf(s.cgccpf);
    const isProponent =
      !!params.accountCgccpf && isSameCgccpf(s.cgccpf, params.accountCgccpf);
    const isRelated = relatedSet.has(dig);
    if (!isProponent && !isRelated) continue;
    if (s.total <= 0) continue;
    members.push({
      name: s.name,
      cgccpf: dig,
      amount: s.total,
      percent: sharePercent(s.total, projectTotal),
      role: isProponent ? "proponent" : "related",
    });
  }

  if (members.length === 0) return null;

  const amount = members.reduce((sum, m) => sum + m.amount, 0);
  return {
    members: members.sort((a, b) => b.percent - a.percent),
    amount,
    percent: sharePercent(amount, projectTotal),
    limitPct: proponentLimitPct(rules, params.personType),
    relatedCount: members.filter((m) => m.role === "related").length,
  };
}

function formatGroupBreakdown(members: ProponentGroupMember[]) {
  return members
    .map((m) => {
      const tag = m.role === "proponent" ? "proponente" : "relacionado art. 23";
      return `${m.name} ${pctLabel(m.percent)} (${tag})`;
    })
    .join("; ");
}

/** Avalia um fornecedor frente ao teto do art. 24 (ou proponente individual art. 23). */
export function evaluateSupplierLimit(params: {
  pronac: string;
  projectName?: string | null;
  projectTotal: number;
  supplierName: string;
  supplierCgccpf: string;
  amount: number;
  accountCgccpf?: string | null;
  isProponent?: boolean;
  personType?: PersonTypeInput | null;
  rules?: ActiveRules;
}): ComplianceAlert | null {
  const rules = params.rules || DEFAULT_RULES;
  const { projectTotal, amount } = params;
  if (projectTotal <= 0 || amount <= 0) return null;

  const percent = sharePercent(amount, projectTotal);
  const isProponent =
    params.isProponent ||
    (!!params.accountCgccpf && isSameCgccpf(params.supplierCgccpf, params.accountCgccpf));

  const limitPct = isProponent
    ? proponentLimitPct(rules, params.personType)
    : rules.caps.supplierCapPct;
  const article = isProponent
    ? rules.caps.articles.proponent
    : rules.caps.articles.supplier;
  const subject = isProponent ? "proponente" : "fornecedor";

  if (percent > limitPct) {
    return {
      level: "critical",
      code: isProponent ? "PROPONENT_OVER_CAP" : "SUPPLIER_OVER_CAP",
      title: `Acima do limite legal (${limitPct}%) — ${params.supplierName}`,
      detail: `No PRONAC ${params.pronac}, ${params.supplierName} recebeu ${pctLabel(percent)} do valor captado do projeto (${formatCurrency(amount)} de ${formatCurrency(projectTotal)}). Pela regra ${rules.sourceCode} (${article}), o mesmo ${subject} não deve passar de ${limitPct}% do valor captado. Há exceções previstas em ${rules.caps.articles.supplierExceptions}.`,
      pronac: params.pronac,
      supplierName: params.supplierName,
      percent,
      amount,
      limitPct,
      sourceCode: rules.sourceCode,
    };
  }

  if (percent >= nearThresholdForLimit(limitPct, rules)) {
    return {
      level: "attention",
      code: isProponent ? "PROPONENT_NEAR_CAP" : "SUPPLIER_NEAR_CAP",
      title: `Próximo do limite de ${limitPct}% — ${params.supplierName}`,
      detail: `No PRONAC ${params.pronac}: ${pctLabel(percent)} (${formatCurrency(amount)}). Ainda faltam cerca de ${pctLabel(Math.max(0, limitPct - percent))} para o limite de ${limitPct}%.`,
      pronac: params.pronac,
      supplierName: params.supplierName,
      percent,
      amount,
      limitPct,
      sourceCode: rules.sourceCode,
    };
  }

  return null;
}

/** Soma proponente + partes relacionadas no teto do art. 23 §1º. */
export function evaluateProponentGroupCap(params: {
  pronac: string;
  projectTotal: number;
  accountCgccpf?: string | null;
  personType?: PersonTypeInput | null;
  suppliers: Array<{ name: string; cgccpf: string; total: number }>;
  relatedParties?: RelatedPartyInput[];
  rules?: ActiveRules;
}): ComplianceAlert | null {
  const rules = params.rules || DEFAULT_RULES;
  const group = computeProponentGroupShare(params);
  if (!group) return null;

  // Sem relacionado enquadrado no §1º, o teto individual do proponente já cobre via evaluateSupplierLimit
  if (group.relatedCount === 0) return null;

  const { percent, amount, limitPct, members } = group;
  const article = rules.caps.articles.proponent;
  const breakdown = formatGroupBreakdown(members);
  const names = members.map((m) => m.name).join(", ");

  const base = {
    pronac: params.pronac,
    supplierName: names,
    percent,
    amount,
    limitPct,
    sourceCode: rules.sourceCode,
    members,
  };

  if (percent > limitPct) {
    return {
      ...base,
      level: "critical",
      code: "PROPONENT_GROUP_OVER_CAP",
      title: `Art. 23: soma ${pctLabel(percent)} acima do limite de ${limitPct}%`,
      detail: `No PRONAC ${params.pronac}, a soma dos percentuais de gasto do proponente e dos fornecedores enquadrados no art. 23 (${rules.sourceCode}, ${article}) é ${pctLabel(percent)} — ${formatCurrency(amount)} de ${formatCurrency(params.projectTotal)}. Detalhe: ${breakdown}. Limite: ${limitPct}%.`,
    };
  }

  if (percent >= nearThresholdForLimit(limitPct, rules)) {
    return {
      ...base,
      level: "attention",
      code: "PROPONENT_GROUP_NEAR_CAP",
      title: `Art. 23: soma ${pctLabel(percent)} perto do limite de ${limitPct}%`,
      detail: `No PRONAC ${params.pronac}, somando só quem entra no art. 23: ${pctLabel(percent)} (${formatCurrency(amount)}). Detalhe: ${breakdown}. Faltam cerca de ${pctLabel(Math.max(0, limitPct - percent))} para o limite.`,
    };
  }

  // Relacionamentos preenchidos e grupo com gasto — mostra a soma mesmo dentro do limite
  return {
    ...base,
    level: "info",
    code: "PROPONENT_GROUP_SUM",
    title: `Art. 23: soma ${pctLabel(percent)} (limite ${limitPct}%)`,
    detail: `No PRONAC ${params.pronac}, com os relacionamentos cadastrados, a soma dos percentuais de gasto apenas de proponente + relacionados do art. 23 (${rules.sourceCode}) é ${pctLabel(percent)} — ${formatCurrency(amount)} de ${formatCurrency(params.projectTotal)}. Detalhe: ${breakdown}.`,
  };
}

export function evaluatePronacSupplierCompliance(params: {
  pronac: string;
  projectName?: string | null;
  projectTotal: number;
  accountCgccpf?: string | null;
  personType?: PersonTypeInput | null;
  relatedParties?: RelatedPartyInput[];
  rules?: ActiveRules;
  suppliers: Array<{
    name: string;
    cgccpf: string;
    total: number;
  }>;
  /**
   * Totais para a soma do §1º (sem alimentação/refeição).
   * Se omitido, usa `suppliers`.
   */
  bondSuppliers?: Array<{
    name: string;
    cgccpf: string;
    total: number;
  }>;
}): ComplianceAlert[] {
  const rules = params.rules || DEFAULT_RULES;
  const alerts: ComplianceAlert[] = [];
  const bondSuppliers = params.bondSuppliers?.length
    ? params.bondSuppliers
    : params.suppliers;

  const group = evaluateProponentGroupCap({
    pronac: params.pronac,
    projectTotal: params.projectTotal,
    accountCgccpf: params.accountCgccpf,
    personType: params.personType,
    suppliers: bondSuppliers,
    relatedParties: params.relatedParties,
    rules,
  });
  if (group) alerts.push(group);

  const relatedSet = new Set(
    (params.relatedParties || [])
      .filter((r) => relatedPartyCountsTowardCap(r, rules))
      .map((r) => normalizeCgccpf(r.cgccpf)),
  );

  for (const s of params.suppliers) {
    const dig = normalizeCgccpf(s.cgccpf);
    const isProponent =
      !!params.accountCgccpf && isSameCgccpf(s.cgccpf, params.accountCgccpf);
    const isRelated = relatedSet.has(dig);
    // Com relacionados no §1º, o agregado cobre proponente/relacionados.
    if ((isProponent || isRelated) && relatedSet.size > 0) continue;

    const alert = evaluateSupplierLimit({
      pronac: params.pronac,
      projectName: params.projectName,
      projectTotal: params.projectTotal,
      supplierName: s.name,
      supplierCgccpf: s.cgccpf,
      amount: s.total,
      accountCgccpf: params.accountCgccpf,
      isProponent,
      personType: params.personType,
      rules,
    });
    if (alert) alerts.push(alert);
  }

  return alerts.sort((a, b) => (b.percent || 0) - (a.percent || 0));
}

export function complianceBadgeLabel(
  percent: number,
  limitPct = DEFAULT_RULES.caps.supplierCapPct,
  nearCapPct = DEFAULT_RULES.caps.nearCapPct,
  rules: ActiveRules = DEFAULT_RULES,
) {
  if (percent > limitPct) return `Acima de ${limitPct}%`;
  const nearAt = nearThresholdForLimit(limitPct, {
    ...rules,
    caps: { ...rules.caps, nearCapPct },
  });
  if (percent >= nearAt) return `Perto de ${limitPct}%`;
  return `Dentro de ${limitPct}%`;
}

export type ComplianceTone = "critical" | "attention" | "ok";

export function worstComplianceTone(
  suppliers: Array<{ total: number; cgccpf?: string }>,
  projectTotal: number,
  accountCgccpf?: string | null,
  options?: {
    personType?: PersonTypeInput | null;
    relatedParties?: RelatedPartyInput[];
    rules?: ActiveRules;
    /** Totais §1º sem alimentação/refeição; se omitido, usa `suppliers`. */
    bondSuppliers?: Array<{ total: number; cgccpf?: string }>;
  },
): ComplianceTone {
  const rules = options?.rules || DEFAULT_RULES;
  const relatedSet = new Set(
    (options?.relatedParties || [])
      .filter((r) => relatedPartyCountsTowardCap(r, rules))
      .map((r) => normalizeCgccpf(r.cgccpf)),
  );

  let worst: ComplianceTone = "ok";
  const bondList = options?.bondSuppliers?.length
    ? options.bondSuppliers
    : suppliers;

  function raise(tone: ComplianceTone) {
    if (tone === "critical") worst = "critical";
    else if (tone === "attention" && worst === "ok") worst = "attention";
  }

  // Qualquer fornecedor (com ou sem vínculo): perto = amarelo, acima = vermelho.
  for (const s of suppliers) {
    if (projectTotal <= 0 || s.total <= 0) continue;
    const percent = sharePercent(s.total, projectTotal);
    const isProponent =
      !!accountCgccpf && !!s.cgccpf && isSameCgccpf(s.cgccpf, accountCgccpf);
    const limit = isProponent
      ? proponentLimitPct(rules, options?.personType)
      : rules.caps.supplierCapPct;
    if (percent > limit) {
      raise("critical");
      continue;
    }
    if (isNearLimit(percent, limit, rules)) raise("attention");
  }

  // Soma art. 23 (proponente + relacionados tipificados), se houver vínculo.
  if (relatedSet.size > 0) {
    let groupTotal = 0;
    for (const s of bondList) {
      if (projectTotal <= 0 || s.total <= 0 || !s.cgccpf) continue;
      const dig = normalizeCgccpf(s.cgccpf);
      const isProponent =
        !!accountCgccpf && isSameCgccpf(s.cgccpf, accountCgccpf);
      const isRelated = relatedSet.has(dig);
      if (isProponent || isRelated) groupTotal += s.total;
    }
    if (groupTotal > 0) {
      const gPct = sharePercent(groupTotal, projectTotal);
      const gLimit = proponentLimitPct(rules, options?.personType);
      if (gPct > gLimit) raise("critical");
      else if (isNearLimit(gPct, gLimit, rules)) raise("attention");
    }
  }

  return worst;
}

export function formatLimitReference(
  percent: number,
  amount: number,
  projectTotal: number,
  rules: ActiveRules = DEFAULT_RULES,
) {
  return `${formatPercent(amount, projectTotal)} · limite ${rules.caps.supplierCapPct}% (${rules.sourceCode})`;
}
