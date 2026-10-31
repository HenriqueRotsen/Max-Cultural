/** Formulário de IN (cadastro/edição na Auditoria) — compartilhado entre tela e servidor. */

import {
  DEFAULT_CAPS,
  RELATION_OPTION_GROUPS,
  type ActiveRules,
  type RelationKind,
} from "@/lib/compliance/defaults";

/** Permissão do hub para cadastrar, editar e excluir INs. */
export const RULESET_EDIT_PERMISSION = "auditoria.ins.editar";

export type RulesetFormValues = {
  id?: string;
  /** Nome como aparece nas telas, ex.: "IN MinC nº 29/2026". */
  sourceCode: string;
  sourceUrl: string;
  /** yyyy-mm-dd */
  effectiveFrom: string;
  /** yyyy-mm-dd ou "" (vigente, sem fim) */
  effectiveTo: string;
  /** IN padrão para projetos sem IN escolhida. */
  isDefault: boolean;
  noPercentLimits: boolean;
  proponentCapPct: string;
  proponentMeiCapPct: string;
  supplierCapPct: string;
  proponentArticle: string;
  supplierArticle: string;
  relations: RelationKind[];
  artisticGroupException: boolean;
  notes: string;
};

/** Tipos de relação que podem contar como vínculo (sem o próprio proponente). */
export const BOND_RELATION_GROUPS = RELATION_OPTION_GROUPS.map((g) => ({
  label: g.label,
  // Fora: o próprio proponente e o diretor de terceiro setor (que por definição não gera vínculo).
  options: g.options.filter(
    (o) => o !== "PROPONENT_PF" && o !== "PROPONENT_PJ" && o !== "DIRECTOR_THIRD_SECTOR",
  ),
})).filter((g) => g.options.length > 0);

const ALLOWED_RELATIONS = new Set<RelationKind>(BOND_RELATION_GROUPS.flatMap((g) => g.options));

export function emptyRulesetForm(): RulesetFormValues {
  return {
    sourceCode: "",
    sourceUrl: "",
    effectiveFrom: "",
    effectiveTo: "",
    isDefault: false,
    noPercentLimits: false,
    proponentCapPct: String(DEFAULT_CAPS.proponentCapPct),
    proponentMeiCapPct: String(DEFAULT_CAPS.proponentMeiCapPct),
    supplierCapPct: String(DEFAULT_CAPS.supplierCapPct),
    proponentArticle: DEFAULT_CAPS.articles.proponent,
    supplierArticle: DEFAULT_CAPS.articles.supplier,
    relations: [...DEFAULT_CAPS.relationRules.countsTowardProponentCap].filter((r) =>
      ALLOWED_RELATIONS.has(r),
    ),
    artisticGroupException: DEFAULT_CAPS.relationRules.artisticGroupException,
    notes: "",
  };
}

/** Valores do formulário a partir de uma IN cadastrada (para editar). */
export function rulesetToForm(rules: ActiveRules & { isDefault?: boolean; rawCaps?: unknown }): RulesetFormValues {
  // Em IN sem limites os tetos efetivos viram 100 — os valores guardados ficam em rawCaps.
  const raw = (rules.rawCaps && typeof rules.rawCaps === "object" ? rules.rawCaps : {}) as Record<
    string,
    unknown
  >;
  const pick = (key: "proponentCapPct" | "proponentMeiCapPct" | "supplierCapPct") =>
    String(
      rules.caps.noPercentLimits
        ? Number(raw[key]) || DEFAULT_CAPS[key]
        : rules.caps[key],
    );
  return {
    id: rules.id,
    sourceCode: rules.sourceCode,
    sourceUrl: rules.sourceUrl,
    effectiveFrom: rules.effectiveFrom,
    effectiveTo: rules.effectiveTo || "",
    isDefault: Boolean(rules.isDefault),
    noPercentLimits: Boolean(rules.caps.noPercentLimits),
    proponentCapPct: pick("proponentCapPct"),
    proponentMeiCapPct: pick("proponentMeiCapPct"),
    supplierCapPct: pick("supplierCapPct"),
    proponentArticle: rules.caps.articles.proponent,
    supplierArticle: rules.caps.articles.supplier,
    relations: rules.caps.relationRules.countsTowardProponentCap.filter((r) =>
      ALLOWED_RELATIONS.has(r),
    ),
    artisticGroupException: rules.caps.relationRules.artisticGroupException,
    notes: rules.caps.relationRules.notes || "",
  };
}

function parsePct(value: string): number | null {
  const n = Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Erros por passo do assistente (1 = identificação, 2 = limites, 3 = vínculos). */
export function validateRulesetForm(v: RulesetFormValues): {
  step: 1 | 2 | 3;
  message: string;
} | null {
  if (!v.sourceCode.trim()) return { step: 1, message: "Informe o nome da IN." };
  if (v.sourceCode.trim().length > 120) return { step: 1, message: "Nome muito longo (até 120 caracteres)." };
  if (v.sourceUrl.trim() && !/^https?:\/\//i.test(v.sourceUrl.trim())) {
    return { step: 1, message: "O link deve começar com http:// ou https://." };
  }
  if (!DATE_RE.test(v.effectiveFrom)) return { step: 1, message: "Informe a data de início da vigência." };
  if (v.effectiveTo && !DATE_RE.test(v.effectiveTo)) return { step: 1, message: "Data de fim inválida." };
  if (v.effectiveTo && v.effectiveTo < v.effectiveFrom) {
    return { step: 1, message: "O fim da vigência não pode ser antes do início." };
  }
  if (!v.noPercentLimits) {
    if (parsePct(v.proponentCapPct) == null) {
      return { step: 2, message: "Limite do proponente (empresa) deve ser de 0,01% a 100%." };
    }
    if (parsePct(v.proponentMeiCapPct) == null) {
      return { step: 2, message: "Limite do proponente (pessoa física/MEI) deve ser de 0,01% a 100%." };
    }
    if (parsePct(v.supplierCapPct) == null) {
      return { step: 2, message: "Limite por fornecedor deve ser de 0,01% a 100%." };
    }
  }
  if (v.relations.some((r) => !ALLOWED_RELATIONS.has(r))) {
    return { step: 3, message: "Tipo de vínculo inválido." };
  }
  if (v.notes.length > 1000) return { step: 3, message: "Observação muito longa (até 1000 caracteres)." };
  return null;
}

/** Monta o JSON `caps` a partir do formulário (mantendo campos que a tela não edita). */
export function formToCaps(v: RulesetFormValues, previous?: Record<string, unknown> | null) {
  const prevArticles =
    previous?.articles && typeof previous.articles === "object"
      ? (previous.articles as Record<string, unknown>)
      : {};
  const proponent = parsePct(v.proponentCapPct) ?? DEFAULT_CAPS.proponentCapPct;
  const proponentMei = parsePct(v.proponentMeiCapPct) ?? proponent;
  const supplier = parsePct(v.supplierCapPct) ?? DEFAULT_CAPS.supplierCapPct;
  return {
    noPercentLimits: v.noPercentLimits,
    proponentCapPct: proponent,
    proponentMeiCapPct: proponentMei,
    supplierCapPct: supplier,
    nearCapPct: Math.max(0, Math.round(supplier * 0.9 * 100) / 100),
    articles: {
      proponent: v.proponentArticle.trim() || DEFAULT_CAPS.articles.proponent,
      supplier: v.supplierArticle.trim() || DEFAULT_CAPS.articles.supplier,
      supplierExceptions: String(
        prevArticles.supplierExceptions || v.supplierArticle.trim() || DEFAULT_CAPS.articles.supplierExceptions,
      ),
    },
    relationRules: {
      countsTowardProponentCap: v.relations,
      artisticGroupException: v.artisticGroupException,
      notes: v.notes.trim(),
    },
  };
}

/** Identificador estável a partir do nome (ex.: "IN MinC nº 29/2026" → "in-minc-n-29-2026"). */
export function slugifyRulesetVersion(sourceCode: string): string {
  const base = sourceCode
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[º°ª]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "in";
}
