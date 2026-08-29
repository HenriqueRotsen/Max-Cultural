import { inferCategoryHint } from "@/lib/planning/homologada";
import { normalizeCnaeCode } from "@/lib/catalog/cnae";

export type RubricCandidate = {
  id: string;
  itemName: string;
  stageName: string;
  productName: string;
  city: string;
  state: string;
  categoryHint: string | null;
  available: number;
  isAdmin?: boolean;
};

export type RubricSuggestion = {
  lineId: string;
  score: number;
  reasons: string[];
};

export type RubricScore = {
  /** 0–100 */
  score: number;
  reasons: string[];
  /** Primeiro motivo, pronto para exibir na UI. */
  label: string;
};

const WEIGHTS = {
  categoryExact: 40,
  categoryInferred: 24,
  item: 35,
  stage: 12,
  keywords: 8,
  amount: 10,
  history: 30,
  location: 8,
} as const;

const RECOMMEND_MIN_SCORE = 15;

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

const STOP = new Set([
  "para",
  "com",
  "sem",
  "por",
  "dos",
  "das",
  "uma",
  "uns",
  "pelo",
  "pela",
  "que",
  "nao",
  "são",
  "sao",
  "serviço",
  "servico",
  "servicos",
  "prestacao",
  "prestação",
  "projeto",
  "pronac",
  "lei",
  "federal",
  "incentivo",
  "cultura",
  "edicao",
  "edição",
  "cnae",
]);

function tokens(s: string): string[] {
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function tokenOverlapScore(queryTokens: string[], haystack: string): number {
  if (queryTokens.length === 0 || !haystack) return 0;
  const hay = norm(haystack);
  let hits = 0;
  for (const t of queryTokens) {
    if (hay.includes(t)) hits += 1;
  }
  return hits / queryTokens.length;
}

function clampScore(value: number) {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function scoreLabel(score: number, reasons: string[]) {
  if (reasons[0]) return reasons[0];
  if (score >= 75) return "Alta aderência";
  if (score >= 50) return "Boa aderência";
  if (score >= 25) return "Aderência parcial";
  if (score > 0) return "Baixa aderência";
  return "Sem compatibilidade";
}

function inferCategoryFromCnaeCode(code: string | null | undefined): string | null {
  const digits = normalizeCnaeCode(code);
  if (!digits || digits.length < 2) return null;
  const div = digits.slice(0, 2);
  const byDiv: Record<string, string> = {
    "35": "energia",
    "41": "construcao_reforma",
    "42": "construcao_reforma",
    "43": "construcao_reforma",
    "49": "logistica_transporte",
    "50": "logistica_transporte",
    "51": "logistica_transporte",
    "52": "logistica_transporte",
    "53": "logistica_transporte",
    "56": "alimentacao_eventos",
    "62": "ti_tecnologia",
    "63": "ti_tecnologia",
    "69": "juridico",
    "71": "engenharia_consultoria",
    "73": "marketing_comunicacao",
    "78": "rh_recrutamento",
    "80": "seguranca",
    "81": "facilities_limpeza",
  };
  return byDiv[div] ?? null;
}

function extractCnaeCodeFromText(text: string): string | null {
  const tagged = text.match(/cnae\s*([\d./-]+)/i);
  if (tagged?.[1]) return normalizeCnaeCode(tagged[1]);
  return null;
}

/** Pontua uma rubrica contra texto livre (CNAE, descrição de serviço, etc.). Escala 0–100. */
export function scoreRubricAgainstText(
  line: Pick<
    RubricCandidate,
    "itemName" | "stageName" | "productName" | "categoryHint" | "available" | "isAdmin"
  >,
  serviceText: string,
  opts?: { grossAmount?: number | null; cnaeCode?: string | null },
): RubricScore {
  const text = serviceText.trim();
  if (!text) return { score: 0, reasons: [], label: "Sem compatibilidade" };

  const qTokens = tokens(text);
  const cnaeCode = opts?.cnaeCode ?? extractCnaeCodeFromText(text);
  const category =
    inferCategoryFromCnaeCode(cnaeCode) || inferCategoryHint(text || "outros");
  const lineCategory =
    line.categoryHint || inferCategoryHint(line.itemName) || null;
  const gross =
    opts?.grossAmount && opts.grossAmount > 0 ? opts.grossAmount : null;

  let score = 0;
  const reasons: string[] = [];

  if (category && category !== "outros" && lineCategory === category) {
    if (line.categoryHint === category) {
      score += WEIGHTS.categoryExact;
      reasons.push(
        cnaeCode
          ? "Categoria alinhada ao CNAE"
          : "Categoria alinhada ao serviço",
      );
    } else {
      score += WEIGHTS.categoryInferred;
      reasons.push("Item parece da mesma categoria do CNAE");
    }
  }

  const itemOverlap = tokenOverlapScore(qTokens, line.itemName);
  if (itemOverlap > 0) {
    score += WEIGHTS.item * itemOverlap;
    if (itemOverlap >= 0.34) {
      reasons.push("Nome da rubrica parecido com a descrição");
    } else if (!reasons.length) {
      reasons.push("Termos em comum com o CNAE");
    }
  }

  const stageOverlap = tokenOverlapScore(
    qTokens,
    `${line.stageName} ${line.productName}`,
  );
  if (stageOverlap > 0) {
    score += WEIGHTS.stage * stageOverlap;
    if (stageOverlap >= 0.34 && !reasons.some((r) => r.includes("etapa"))) {
      reasons.push("Etapa/produto com termos em comum");
    }
  }

  const itemN = norm(line.itemName);
  let keywordPts = 0;
  for (const t of qTokens) {
    if (t.length >= 5 && itemN.includes(t)) {
      keywordPts += 2;
    }
  }
  if (keywordPts > 0) {
    score += Math.min(WEIGHTS.keywords, keywordPts);
  }

  if (gross != null) {
    if (line.available + 0.009 >= gross) {
      score += WEIGHTS.amount;
      reasons.push("Saldo cobre o valor da nota");
    } else if (line.available > 0) {
      score += 3;
    } else if (line.isAdmin) {
      score -= 8;
    }
  }

  if (
    line.isAdmin &&
    !/admin|coordenac|coordenação|gestao|gestão/.test(norm(text))
  ) {
    score -= 8;
  }

  const finalScore = clampScore(score);
  const trimmedReasons = reasons.slice(0, 3);
  return {
    score: finalScore,
    reasons: trimmedReasons,
    label: scoreLabel(finalScore, trimmedReasons),
  };
}

/** Limiar mínimo para destacar rubrica como recomendada (0–100). */
export function adherenceRecommendThreshold(topScore: number) {
  if (topScore <= 0) return 100;
  return Math.max(RECOMMEND_MIN_SCORE, topScore * 0.75);
}

/**
 * Ranqueia rubricas do projeto para uma NF/RPA com base em histórico do
 * fornecedor, categoria, texto do serviço e saldo disponível.
 */
export function recommendRubric(params: {
  lines: RubricCandidate[];
  serviceText: string;
  cnaeDescription?: string | null;
  city?: string | null;
  state?: string | null;
  grossAmount?: number | null;
  /** Contagem de contratações anteriores neste projeto por budgetLineId. */
  historyByLineId?: Record<string, number>;
}): RubricSuggestion | null {
  const candidates = params.lines.filter(
    (l) => l.available > 0.009 || l.isAdmin,
  );
  if (candidates.length === 0) return null;

  const serviceText = [params.serviceText, params.cnaeDescription]
    .filter(Boolean)
    .join(" ");
  const gross = params.grossAmount && params.grossAmount > 0 ? params.grossAmount : null;
  const history = params.historyByLineId || {};
  const maxHist = Math.max(0, ...Object.values(history));

  const nfCity = params.city ? norm(params.city) : "";
  const nfState = params.state ? norm(params.state) : "";

  let best: RubricSuggestion | null = null;

  for (const line of candidates) {
    const base = scoreRubricAgainstText(line, serviceText, { grossAmount: gross });
    let score = base.score;
    const reasons = [...base.reasons];

    const hist = history[line.id] || 0;
    if (hist > 0 && maxHist > 0) {
      const boost = WEIGHTS.history * (hist / maxHist);
      score = clampScore(score + boost);
      reasons.unshift(
        hist === 1
          ? "Já usado com este fornecedor neste projeto"
          : `Usado ${hist}× com este fornecedor neste projeto`,
      );
    }

    if (nfState && norm(line.state) === nfState) {
      score = clampScore(score + 4);
      if (nfCity && norm(line.city).includes(nfCity.split(/\s+/)[0] || "")) {
        score = clampScore(score + 4);
        reasons.push("Local da rubrica combina");
      }
    }

    if (!best || score > best.score) {
      best = {
        lineId: line.id,
        score,
        reasons: reasons.slice(0, 3),
      };
    }
  }

  if (!best || best.score < RECOMMEND_MIN_SCORE) {
    const withSaldo =
      gross != null
        ? candidates.find((l) => l.available + 0.009 >= gross)
        : null;
    const fallback = withSaldo || candidates[0]!;
    return {
      lineId: fallback.id,
      score: best?.score || 0,
      reasons: best?.reasons.length
        ? best.reasons
        : ["Primeira rubrica com saldo disponível"],
    };
  }

  return best;
}
