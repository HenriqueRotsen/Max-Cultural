import type { ActiveRules, RelationKind } from "@/lib/compliance/defaults";
import { corporateMapCopy } from "@/lib/corporate/copy";

export type AuditProblem = {
  code: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type AuditRecommendation = {
  code: string;
  title: string;
  detail: string;
  category?: "documents" | "ruleset" | "relationships" | "corporate_structure" | "process";
};

export type AuditBrief = {
  generatedAt: string;
  recommendedRulesetVersion: string;
  /** Probabilidade relativa (0–100) entre as candidatas ranqueadas. */
  alternatives: { version: string; probability: number; why: string }[];
  problems: AuditProblem[];
  recommendations: AuditRecommendation[];
  auditContextNotes: string;
  model: string;
};

export type LinkedParty = {
  name: string;
  cgccpf: string;
  /** Legado — preferir hasBond */
  relation?: RelationKind | null;
  /** Lado A (proponente) da aresta explícita */
  relatedTo?: { name: string; cgccpf: string };
  artisticGroupException?: boolean;
  /** true se for observado do workspace */
  isWatched?: boolean;
  /** Vínculo on/off sob a IN do projeto */
  hasBond?: boolean;
  paidInProject?: number;
};

export type SupplierShare = {
  name: string;
  cgccpf: string;
  total: number;
  percent: number;
};

export type PaymentSlice = {
  date: Date;
  amount: number;
};

export type RulesetScore = {
  rules: ActiveRules;
  score: number;
  /** Fração do valor pago cuja data cai na vigência da IN (0–1). */
  coveragePct: number;
  proponentPct: number;
  maxSupplierPct: number;
  overProponent: boolean;
  overSupplierCount: number;
  relatedCounted: LinkedParty[];
  why: string;
};

/** % do montante pago coberto pela vigência da IN. */
export function rulesetPaymentCoverage(
  rules: ActiveRules,
  payments: PaymentSlice[],
): number {
  if (!payments.length) return 0;
  const from = new Date(rules.effectiveFrom).getTime();
  const to = (rules.effectiveTo ? new Date(rules.effectiveTo) : new Date("2999-01-01")).getTime();
  let covered = 0;
  let total = 0;
  for (const p of payments) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0 || !p.date) continue;
    total += amt;
    const t = p.date.getTime();
    if (t >= from && t <= to) covered += amt;
  }
  return total > 0 ? covered / total : 0;
}

function sharePercent(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

export function relationCountsTowardCap(
  relation: RelationKind | null | undefined,
  rules: ActiveRules,
  artisticGroupException?: boolean,
) {
  if (!relation) return false;
  if (artisticGroupException && rules.caps.relationRules.artisticGroupException) {
    return false;
  }
  return rules.caps.relationRules.countsTowardProponentCap.includes(relation);
}

export function scoreRulesetForProject(params: {
  rules: ActiveRules;
  projectTotal: number;
  proponentPaid: number;
  suppliers: SupplierShare[];
  linked: LinkedParty[];
  personType?: "PJ" | "PF" | "MEI";
  /** Pagamentos com data — cobre a vigência da IN (prioridade no ranking). */
  payments?: PaymentSlice[];
}): RulesetScore {
  const { rules, projectTotal, suppliers, linked, personType } = params;
  const relatedCounted = linked.filter(
    (l) =>
      l.hasBond === true ||
      relationCountsTowardCap(l.relation, rules, l.artisticGroupException),
  );
  const relatedPaid = relatedCounted.reduce((s, l) => s + (l.paidInProject || 0), 0);
  const proponentBucket = params.proponentPaid + relatedPaid;
  const proponentPct = sharePercent(proponentBucket, projectTotal);
  const proponentLimit =
    personType === "PF" || personType === "MEI"
      ? rules.caps.proponentMeiCapPct
      : rules.caps.proponentCapPct;
  const overProponent = proponentPct > proponentLimit;
  const overSuppliers = suppliers.filter((s) => s.percent > rules.caps.supplierCapPct);
  const maxSupplierPct = suppliers.reduce((m, s) => Math.max(m, s.percent), 0);

  const hasPayments = Boolean(params.payments?.length);
  const coveragePct = hasPayments
    ? rulesetPaymentCoverage(rules, params.payments!)
    : 0;

  // 1º cobertura temporal dos pagamentos (domina); 2º tetos altos; 3º penaliza estouro/vínculos
  let margin =
    rules.caps.proponentCapPct * 1.2 +
    rules.caps.supplierCapPct +
    (personType === "PF" || personType === "MEI" ? rules.caps.proponentMeiCapPct * 0.3 : 0);
  margin -= relatedCounted.length * 2;
  if (overProponent) margin -= 40 + (proponentPct - proponentLimit);
  margin -= overSuppliers.length * 15;

  let score = margin;
  if (hasPayments) {
    // Cobertura 0–100% pesa ~100 pts: IN sem overlap perde para qualquer IN com execução real
    score = coveragePct * 100 + margin;
    if (coveragePct < 0.05) score -= 80;
  }

  const why = [
    hasPayments
      ? `Cobre ${(coveragePct * 100).toFixed(0)}% do valor pago na vigência`
      : null,
    `Teto proponente ${proponentLimit}% · fornecedor ${rules.caps.supplierCapPct}%`,
    relatedCounted.length
      ? `${relatedCounted.length} vínculo(s) entram no teto nesta IN`
      : "Nenhum vínculo cadastrado entra no teto nesta IN",
    overProponent ? `Soma proponente+relacionados ${proponentPct.toFixed(4)}% (acima)` : null,
    overSuppliers.length ? `${overSuppliers.length} fornecedor(es) acima do teto` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    rules,
    score,
    coveragePct,
    proponentPct,
    maxSupplierPct,
    overProponent,
    overSupplierCount: overSuppliers.length,
    relatedCounted,
    why,
  };
}

/** Softmax → % relativos (somam ~100) a partir dos scores de ranking. */
export function scoresToProbabilities(scores: number[], temperature = 10): number[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) return [100];
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / Math.max(temperature, 1)));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const raw = exps.map((e) => (e / sum) * 100);
  // Arredonda e corrige residual para somar 100
  const rounded = raw.map((p) => Math.round(p * 10) / 10);
  const drift = Math.round((100 - rounded.reduce((a, b) => a + b, 0)) * 10) / 10;
  rounded[0] = Math.round((rounded[0] + drift) * 10) / 10;
  return rounded;
}

/** Força única para escolha e probabilidade: cobertura + score (tetos/estouros). */
export function rankingStrength(s: RulesetScore): number {
  return s.coveragePct * 1000 + s.score;
}

/** Maior rankingStrength primeiro (mesma ordem da probabilidade). */
export function compareRulesetScores(a: RulesetScore, b: RulesetScore): number {
  return rankingStrength(b) - rankingStrength(a);
}

export function buildDeterministicBrief(params: {
  scores: RulesetScore[];
  chosen?: ActiveRules;
  suppliers: SupplierShare[];
  linked: LinkedParty[];
  projectTotal: number;
  pronacYear: number;
  model?: string;
  institutionalMap?: boolean;
}): AuditBrief {
  const ranked = [...params.scores].sort(compareRulesetScores);
  const best = ranked[0];
  const chosen = params.chosen || best?.rules;
  const problems: AuditProblem[] = [];
  const recommendations: AuditRecommendation[] = [];
  const mapCopy = corporateMapCopy(Boolean(params.institutionalMap));

  const unpaidBonds = params.linked.filter(
    (l) =>
      (l.paidInProject || 0) > 0 &&
      l.isWatched &&
      l.hasBond !== true,
  );

  if (unpaidBonds.length) {
    problems.push({
      code: "watched_bond_off",
      severity: "medium",
      title: "Observados com pagamento sem vínculo ligado nesta IN",
      detail: `${unpaidBonds.length} observado(s) receberam no projeto sem o vínculo on/off ativo para esta IN. Sem o vínculo, eles não entram na soma do art. 23.`,
    });
    recommendations.push({
      code: "fill_bonds",
      category: "relationships",
      title: "Ligar o vínculo no detalhe do PRONAC",
      detail:
        "No detalhe do PRONAC, ative o vínculo do observado para a IN do projeto. O estado vale para todos os PRONACs deste proponente com a mesma IN.",
    });
  }

  if (chosen) {
    const score = ranked.find((s) => s.rules.version === chosen.version) || best;
    if (score?.overProponent) {
      problems.push({
        code: "proponent_cap_over",
        severity: "high",
        title: `Soma proponente + vínculos acima de ${chosen.caps.proponentCapPct}%`,
        detail: `Na IN ${chosen.sourceCode}, a soma chega a ${score.proponentPct.toFixed(4)}% do valor captado do projeto.`,
      });
    }
    if (score && score.overSupplierCount > 0) {
      problems.push({
        code: "supplier_cap_over",
        severity: "high",
        title: `Fornecedor(es) acima de ${chosen.caps.supplierCapPct}%`,
        detail: `${score.overSupplierCount} fornecedor(es) ultrapassam o teto desta IN (exceto hipóteses de obras/restauro, se cabíveis).`,
      });
    }
  }

  const bondedPaid = params.linked.filter(
    (l) => l.hasBond === true && (l.paidInProject || 0) > 0,
  );
  if (bondedPaid.length) {
    problems.push({
      code: "corporate_link",
      severity: "medium",
      title: "Observados com vínculo e pagamento no projeto",
      detail: bondedPaid
        .map((c) => {
          const edge = c.relatedTo
            ? `${c.relatedTo.name} ↔ ${c.name}`
            : c.name;
          return edge;
        })
        .join("; "),
    });
    recommendations.push({
      code: "corporate_structure_review",
      category: "corporate_structure",
      title: mapCopy.briefTitle,
      detail: mapCopy.briefDetail,
    });
  }

  recommendations.push({
    code: "price_research",
    category: "documents",
    title: "Guardar pesquisas de preços e justificativas",
    detail:
      "Convém manter cotações, propostas e justificativa técnica da escolha de fornecedores. O sync do SALIC não traz esses anexos.",
  });

  recommendations.push({
    code: "in_applicability",
    title: "Documentar a IN vinculada ao projeto",
    detail:
      "Se a execução se vincula a uma IN diferente da vigente no momento de uma cobrança (ex.: regime de 50% em 2023), registre o fundamento da vinculação. A norma citada em pedido pontual não define, por si, a IN do projeto.",
  });

  if (best && chosen && best.rules.version !== chosen.version) {
    recommendations.push({
      code: "consider_best_in",
      category: "ruleset",
      title: `Melhor IN sugerida: ${best.rules.sourceCode}`,
      detail: best.why,
    });
  }

  void params.projectTotal;
  void params.pronacYear;

  return {
    generatedAt: new Date().toISOString(),
    recommendedRulesetVersion: best?.rules.version || chosen?.version || "in-minc-29-2026",
    alternatives: (() => {
      const top = ranked.slice(0, 5);
      const probs = scoresToProbabilities(top.map(rankingStrength), 40);
      return top
        .map((s, i) => ({
          version: s.rules.version,
          probability: probs[i] ?? 0,
          why: s.why,
        }))
        .sort((a, b) => b.probability - a.probability);
    })(),
    problems,
    recommendations,
    auditContextNotes:
      "A IN aplicável ao projeto depende da vinculação normativa da execução — a norma citada em uma cobrança pontual não substitui essa análise.",
    model: params.model || "deterministic",
  };
}
