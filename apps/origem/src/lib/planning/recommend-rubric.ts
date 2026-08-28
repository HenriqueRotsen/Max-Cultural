import { inferCategoryHint } from "@/lib/planning/homologada";

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

/** Pontua uma rubrica contra texto livre (CNAE, descrição de serviço, etc.). */
export function scoreRubricAgainstText(
  line: Pick<
    RubricCandidate,
    "itemName" | "stageName" | "productName" | "categoryHint" | "available" | "isAdmin"
  >,
  serviceText: string,
  opts?: { grossAmount?: number | null },
): { score: number; reasons: string[] } {
  const text = serviceText.trim();
  if (!text) return { score: 0, reasons: [] };

  const qTokens = tokens(text);
  const category = inferCategoryHint(text || "outros");
  const gross =
    opts?.grossAmount && opts.grossAmount > 0 ? opts.grossAmount : null;

  let score = 0;
  const reasons: string[] = [];

  if (
    category &&
    category !== "outros" &&
    line.categoryHint &&
    line.categoryHint === category
  ) {
    score += 22;
    reasons.push("Categoria alinhada ao CNAE/serviço");
  }

  const itemOverlap = tokenOverlapScore(qTokens, line.itemName);
  if (itemOverlap > 0) {
    score += 35 * itemOverlap;
    if (itemOverlap >= 0.34) {
      reasons.push("Nome da rubrica parecido com a descrição");
    }
  }

  const stageOverlap = tokenOverlapScore(
    qTokens,
    `${line.stageName} ${line.productName}`,
  );
  if (stageOverlap > 0) {
    score += 12 * stageOverlap;
  }

  const itemN = norm(line.itemName);
  for (const t of qTokens) {
    if (t.length >= 5 && itemN.includes(t)) {
      score += 4;
    }
  }

  if (gross != null) {
    if (line.available + 0.009 >= gross) score += 10;
    else if (line.available > 0) score += 2;
    else if (line.isAdmin) score -= 8;
  }

  if (
    line.isAdmin &&
    !/admin|coordenac|coordenação|gestao|gestão/.test(norm(text))
  ) {
    score -= 6;
  }

  return { score, reasons: reasons.slice(0, 3) };
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
      const boost = 45 * (hist / maxHist);
      score += boost;
      reasons.unshift(
        hist === 1
          ? "Já usado com este fornecedor neste projeto"
          : `Usado ${hist}× com este fornecedor neste projeto`,
      );
    }

    if (nfState && norm(line.state) === nfState) {
      score += 4;
      if (nfCity && norm(line.city).includes(nfCity.split(/\s+/)[0] || "")) {
        score += 4;
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

  if (!best || best.score < 8) {
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
