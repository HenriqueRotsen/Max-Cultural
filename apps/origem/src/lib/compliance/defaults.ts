/** Defaults e catálogo histórico de INs (linha do tempo). */

import { FEDERAL_ROUANET_PLANNING } from "@/lib/compliance/planning-params";
import type { PlanningParams } from "@/lib/compliance/planning-params";

export const DEFAULT_SOURCE_URL =
  "https://www.gov.br/cultura/pt-br/acesso-a-informacao/legislacao-e-normativas/instrucao-normativa-minc-no-29-de-29-de-janeiro-de-2026";

export const DEFAULT_LEGISLATION_INDEX_URL =
  "https://www.gov.br/cultura/pt-br/acesso-a-informacao/legislacao-e-normativas";

/** Busca única no DOU — útil para INs antigas sem página dedicada no portal. */
export function douSearchUrl(query: string) {
  const q = encodeURIComponent(query);
  return `https://www.in.gov.br/consulta/-/buscar/dou?q=${q}&s=todos&exactDate=all_period&sortType=0`;
}

export type RelationKind =
  | "SPOUSE"
  | "COMPANION"
  | "LINEAL_KIN"
  | "COLLATERAL_2ND"
  | "COLLATERAL_3RD"
  | "AFFINITY"
  | "PARTNER"
  | "AFFILIATED_COMPANY"
  | "COMMON_PARTNER"
  | "COUPLE_PARTNERS"
  | "CORPORATE_MEMBER"
  | "PROPONENT"
  | "PROPONENT_PF"
  | "PROPONENT_PJ"
  | "DIRECTOR_THIRD_SECTOR"
  | "SAME_ADDRESS"
  | "OTHER";

/** Tipos legados: na UI aparecem como “Sem vínculo”. */
export const RELATION_LEGACY_AS_EMPTY: ReadonlySet<RelationKind> = new Set([
  "OTHER",
  "PARTNER",
  "PROPONENT",
]);

/**
 * Relacionamentos que tipificam vínculo art. 23 (entram na soma do teto do proponente,
 * conforme a IN do projeto).
 */
export const RELATION_GENERATES_BOND: ReadonlySet<RelationKind> = new Set([
  "SPOUSE",
  "COMPANION",
  "LINEAL_KIN",
  "COLLATERAL_2ND",
  "AFFINITY",
  "AFFILIATED_COMPANY",
  "COMMON_PARTNER",
  "COUPLE_PARTNERS",
]);

export function relationGeneratesBond(relation: string | null | undefined): boolean {
  if (!relation) return false;
  return RELATION_GENERATES_BOND.has(relation as RelationKind);
}

export type RelationRules = {
  countsTowardProponentCap: RelationKind[];
  artisticGroupException: boolean;
  notes: string;
};

export type ComplianceCaps = {
  proponentCapPct: number;
  proponentMeiCapPct: number;
  supplierCapPct: number;
  nearCapPct: number;
  articles: {
    proponent: string;
    supplier: string;
    supplierExceptions: string;
  };
  relationRules: RelationRules;
};

export type ActiveRules = {
  id?: string;
  version: string;
  sourceCode: string;
  sourceUrl: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  caps: ComplianceCaps;
  legalSummary?: string | null;
  jurisprudenceNotes?: string | null;
  needsReview?: boolean;
};

const REL_FULL: RelationKind[] = [
  "SPOUSE",
  "COMPANION",
  "LINEAL_KIN",
  "COLLATERAL_2ND",
  "AFFINITY",
  "AFFILIATED_COMPANY",
  "COMMON_PARTNER",
  "COUPLE_PARTNERS",
];

const REL_NARROW_2023: RelationKind[] = [
  "SPOUSE",
  "COMPANION",
  "AFFILIATED_COMPANY",
  "COMMON_PARTNER",
  "COUPLE_PARTNERS",
];

const REL_NARROW_2024: RelationKind[] = [
  "SPOUSE",
  "COMPANION",
  "AFFILIATED_COMPANY",
  "COMMON_PARTNER",
  "COUPLE_PARTNERS",
];

function caps(partial: {
  proponentCapPct: number;
  proponentMeiCapPct?: number;
  supplierCapPct: number;
  nearCapPct?: number;
  articles: ComplianceCaps["articles"];
  relationRules: RelationRules;
}): ComplianceCaps {
  return {
    proponentCapPct: partial.proponentCapPct,
    proponentMeiCapPct: partial.proponentMeiCapPct ?? partial.proponentCapPct,
    supplierCapPct: partial.supplierCapPct,
    nearCapPct: partial.nearCapPct ?? Math.max(0, partial.supplierCapPct - 2),
    articles: partial.articles,
    relationRules: partial.relationRules,
  };
}

export const DEFAULT_CAPS: ComplianceCaps = caps({
  proponentCapPct: 20,
  proponentMeiCapPct: 30,
  supplierCapPct: 20,
  nearCapPct: 18,
  articles: {
    proponent: "art. 23",
    supplier: "art. 24",
    supplierExceptions: "art. 24",
  },
  relationRules: {
    countsTowardProponentCap: REL_NARROW_2024,
    artisticGroupException: true,
    notes: "IN MinC 29/2026 — cônjuge, companheiro, coligada ou sócio em comum; PF/MEI até 30%.",
  },
});

export type RulesetSeed = {
  version: string;
  sourceCode: string;
  sourceUrl: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "archived";
  caps: ComplianceCaps;
  legalSummary: string;
  jurisprudenceNotes: string;
  notes?: string;
  jurisdiction?: string;
  kind?: "AUDIT_CAPS" | "PLANNING" | "BOTH";
  planning?: PlanningParams | null;
};

/** Linha do tempo das INs (PDF + IN 29/2026 vigente). */
export const RULESET_CATALOG: RulesetSeed[] = [
  {
    version: "in-1-2012",
    sourceCode: "IN nº 1/2012",
    sourceUrl: douSearchUrl("Instrução Normativa MinC nº 1 de 9 de fevereiro de 2012"),
    effectiveFrom: "2012-02-09",
    effectiveTo: "2013-06-23",
    status: "archived",
    caps: caps({
      proponentCapPct: 10,
      supplierCapPct: 100,
      nearCapPct: 9,
      articles: {
        proponent: "art. 20",
        supplier: "—",
        supplierExceptions: "—",
      },
      relationRules: {
        countsTowardProponentCap: ["SPOUSE", "COMPANION", "OTHER"],
        artisticGroupException: false,
        notes: "Remuneração do proponente limitada a 10% do total aprovado, teto R$ 100.000.",
      },
    }),
    legalSummary:
      "Art. 20: proponente remunerado com recursos de renúncia fiscal, limitado a 10% do total aprovado até R$ 100.000.",
    jurisprudenceNotes:
      "Período inicial de teto baixo para o proponente; concentração de fornecedor pouco tipificada em % fixo neste extrato.",
  },
  {
    version: "in-01-2013",
    sourceCode: "IN nº 01/2013",
    sourceUrl: douSearchUrl("Instrução Normativa MinC nº 1 de 24 de junho de 2013"),
    effectiveFrom: "2013-06-24",
    effectiveTo: "2017-03-19",
    status: "archived",
    caps: caps({
      proponentCapPct: 20,
      supplierCapPct: 100,
      nearCapPct: 18,
      articles: {
        proponent: "art. 24",
        supplier: "art. 32",
        supplierExceptions: "art. 32 §1º",
      },
      relationRules: {
        countsTowardProponentCap: REL_FULL,
        artisticGroupException: true,
        notes: "Vedações a parentes e concentração com economicidade (cotação).",
      },
    }),
    legalSummary:
      "Art. 24: remuneração do proponente prevista. Art. 32: desconcentração — mais de cinco itens do mesmo fornecedor exige economicidade e cotações.",
    jurisprudenceNotes:
      "Foco em desconcentração e economicidade; grupos artísticos familiares já aparecem como exceção em normas posteriores.",
  },
  {
    version: "in-01-2017",
    sourceCode: "IN nº 01/2017",
    sourceUrl: douSearchUrl("Instrução Normativa MinC nº 1 de 20 de março de 2017"),
    effectiveFrom: "2017-03-20",
    effectiveTo: "2017-12-25",
    status: "archived",
    caps: caps({
      proponentCapPct: 20,
      supplierCapPct: 20,
      nearCapPct: 18,
      articles: {
        proponent: "art. 28",
        supplier: "art. 45",
        supplierExceptions: "art. 45",
      },
      relationRules: {
        countsTowardProponentCap: [
          "SPOUSE",
          "COMPANION",
          "LINEAL_KIN",
          "COLLATERAL_2ND",
          "AFFINITY",
        ],
        artisticGroupException: true,
        notes: "Art. 45 IX — parentes até 2º grau e afinidade; exceção grupos artísticos familiares.",
      },
    }),
    legalSummary:
      "Art. 28: remuneração do proponente até 20% do valor do projeto. Art. 45: vedações a parentes até 2º grau e afinidade.",
    jurisprudenceNotes: "Teto de 20% para proponente; parentesco colateral já relevante.",
  },
  {
    version: "in-5-2017",
    sourceCode: "IN nº 5/2017",
    sourceUrl:
      "https://www.in.gov.br/web/dou/-/instrucao-normativa-n-5-de-26-de-dezembro-de-2017-1393379",
    effectiveFrom: "2017-12-26",
    effectiveTo: "2019-04-22",
    status: "archived",
    caps: caps({
      proponentCapPct: 50,
      supplierCapPct: 50,
      nearCapPct: 45,
      articles: {
        proponent: "art. 11",
        supplier: "art. 11 §3º",
        supplierExceptions: "art. 11 §3º (obras/restauros)",
      },
      relationRules: {
        countsTowardProponentCap: REL_FULL,
        artisticGroupException: true,
        notes:
          "§1º: cônjuge, companheiro, parentes até 2º grau, afinidade, coligada ou sócio em comum entram no limite do proponente.",
      },
    }),
    legalSummary:
      "Art. 11: proponente até 50% do Custo do Projeto. Mesmo fornecedor pode superar 50% em obras e restauros. Grupos artísticos familiares e corpos estáveis fora do limite.",
    jurisprudenceNotes:
      "Era de margem ampla (50%). Avaliar se a execução do projeto se vinculou a este regime.",
  },
  {
    version: "in-2-2019",
    sourceCode: "IN nº 2/2019",
    sourceUrl: douSearchUrl("Instrução Normativa nº 2 de 23 de abril de 2019 Cidadania Pronac"),
    effectiveFrom: "2019-04-23",
    effectiveTo: "2022-02-03",
    status: "archived",
    caps: caps({
      proponentCapPct: 50,
      supplierCapPct: 50,
      nearCapPct: 45,
      articles: {
        proponent: "art. 11",
        supplier: "art. 11",
        supplierExceptions: "art. 11",
      },
      relationRules: {
        countsTowardProponentCap: REL_FULL,
        artisticGroupException: true,
        notes: "Mesma lógica de 50% sobre valor homologado; parentesco até 2º grau + afinidade + coligada.",
      },
    }),
    legalSummary:
      "Art. 11: proponente até 50% do valor homologado para execução. Relacionados (§1º) computam no limite. Exceção grupos artísticos familiares e corpos estáveis.",
    jurisprudenceNotes: "Continuidade do regime de 50%.",
  },
  {
    version: "in-secult-1-2022",
    sourceCode: "IN SECULT/MTUR nº 1/2022",
    sourceUrl:
      "https://www.in.gov.br/en/web/dou/-/instrucao-normativa-secult/mtur-n-1-de-4-de-fevereiro-de-2022-378650380",
    effectiveFrom: "2022-02-04",
    effectiveTo: "2022-08-30",
    status: "archived",
    caps: caps({
      proponentCapPct: 15,
      supplierCapPct: 20,
      nearCapPct: 18,
      articles: {
        proponent: "art. 16",
        supplier: "art. 16 §3º",
        supplierExceptions: "art. 16 §3º (obras/restauros; teto R$100k)",
      },
      relationRules: {
        countsTowardProponentCap: REL_FULL,
        artisticGroupException: true,
        notes: "§1º parentesco até 2º grau, afinidade, coligada ou sócio em comum.",
      },
    }),
    legalSummary:
      "Art. 16: proponente até 15% do captado; mesmo fornecedor até 20% (exceto obras/restauros), limitado a R$ 100.000.",
    jurisprudenceNotes:
      "Aperto de margem. Projetos que cruzam 2023 podem discutir vinculação à IN mais favorável posterior.",
  },
  {
    version: "in-secult-3-2022",
    sourceCode: "IN SECULT/MTUR nº 3/2022",
    sourceUrl: douSearchUrl("Instrução Normativa SECULT/MTUR nº 3 de 31 de agosto de 2022"),
    effectiveFrom: "2022-08-31",
    effectiveTo: "2023-04-09",
    status: "archived",
    caps: caps({
      proponentCapPct: 15,
      supplierCapPct: 20,
      nearCapPct: 18,
      articles: {
        proponent: "art. 16",
        supplier: "art. 16 §3º",
        supplierExceptions: "art. 16 §3º (obras/restauros ou execução continuada)",
      },
      relationRules: {
        countsTowardProponentCap: REL_FULL,
        artisticGroupException: true,
        notes: "Alteração do §3º: inclui ações de execução continuada nas exceções de fornecedor.",
      },
    }),
    legalSummary:
      "Mantém 15%/20%; §3º ampliado para obras/restauros ou ações de execução continuada.",
    jurisprudenceNotes: "Ponte para a IN MinC 1/2023 (retorno ao 50%).",
  },
  {
    version: "in-minc-1-2023",
    sourceCode: "IN MinC nº 1/2023",
    sourceUrl:
      "https://www.gov.br/cultura/pt-br/acesso-a-informacao/legislacao-e-normativas/instrucao-normativa-minc-no-1-de-10-de-abril-de-2023",
    effectiveFrom: "2023-04-10",
    effectiveTo: "2024-01-29",
    status: "archived",
    caps: caps({
      proponentCapPct: 50,
      supplierCapPct: 50,
      nearCapPct: 45,
      articles: {
        proponent: "art. 13",
        supplier: "art. 13 §3º",
        supplierExceptions: "art. 13 §3º (arquitetura/obras/restauros)",
      },
      relationRules: {
        countsTowardProponentCap: REL_NARROW_2023,
        artisticGroupException: true,
        notes:
          "§1º do extrato: cônjuge, companheiro, coligada ou sócio em comum — texto mais enxuto que INs anteriores quanto a colateral/afinidade.",
      },
    }),
    legalSummary:
      "Art. 13: proponente até 50% do captado; mesmo fornecedor até 50% (exceto arquitetura/obras/restauros). Exceção grupos artísticos e corpos estáveis.",
    jurisprudenceNotes:
      "IN frequentemente mais favorável (50%) e §1º potencialmente mais estreito sobre parentesco colateral — relevante se há irmãos/observados colaterais. Projetos aprovados em 2022 e executados em 2023 podem discutir vinculação a esta IN.",
  },
  {
    version: "in-minc-11-2024",
    sourceCode: "IN MinC nº 11/2024",
    sourceUrl: douSearchUrl("Instrução Normativa MinC nº 11 de 30 de janeiro de 2024"),
    effectiveFrom: "2024-01-30",
    effectiveTo: "2025-02-04",
    status: "archived",
    caps: caps({
      proponentCapPct: 20,
      supplierCapPct: 20,
      nearCapPct: 18,
      articles: {
        proponent: "art. 14",
        supplier: "art. 14 §3º",
        supplierExceptions: "art. 14 §3º (conservação/restauro/equipamentos)",
      },
      relationRules: {
        countsTowardProponentCap: REL_NARROW_2024,
        artisticGroupException: true,
        notes: "§1º: cônjuge, companheiro, coligada ou sócio em comum.",
      },
    }),
    legalSummary:
      "Art. 14: proponente até 20%; fornecedor até 20% (exceto conservação/restauro/equipamentos culturais).",
    jurisprudenceNotes: "Retorno ao regime de 20%.",
  },
  {
    version: "in-minc-23-2025",
    sourceCode: "IN MinC nº 23/2025",
    sourceUrl:
      "https://www.gov.br/cultura/pt-br/acesso-a-informacao/legislacao-e-normativas/instrucao-normativa-minc-no-23-de-5-de-fevereiro-de-2025",
    effectiveFrom: "2025-02-05",
    effectiveTo: "2026-01-28",
    status: "archived",
    caps: caps({
      proponentCapPct: 20,
      proponentMeiCapPct: 30,
      supplierCapPct: 20,
      nearCapPct: 18,
      articles: {
        proponent: "art. 26",
        supplier: "art. 27",
        supplierExceptions: "art. 27",
      },
      relationRules: {
        countsTowardProponentCap: REL_NARROW_2024,
        artisticGroupException: true,
        notes: "§2º II: PF/MEI até 30%. Grupos/coletivos artísticos fora do limite.",
      },
    }),
    legalSummary:
      "Art. 26: proponente 20% (PF/MEI até 30%). Art. 27: fornecedor até 20%.",
    jurisprudenceNotes: "Base próxima da IN 29/2026.",
  },
  {
    version: "in-minc-29-2026",
    sourceCode: "IN MinC nº 29/2026",
    sourceUrl: DEFAULT_SOURCE_URL,
    effectiveFrom: "2026-01-29",
    effectiveTo: null,
    status: "active",
    caps: DEFAULT_CAPS,
    jurisdiction: "FEDERAL",
    kind: "BOTH",
    planning: FEDERAL_ROUANET_PLANNING,
    legalSummary:
      "Arts. 23 e 24: proponente 20% (PF/MEI 30%); fornecedor 20%.",
    jurisprudenceNotes:
      "Norma vigente. Projetos de eras anteriores devem analisar a vinculação à IN da execução, não assumir automaticamente este texto.",
    notes: "Vigente — default global",
  },
];

export const DEFAULT_RULES: ActiveRules = {
  version: "in-minc-29-2026",
  sourceCode: "IN MinC nº 29/2026",
  sourceUrl: DEFAULT_SOURCE_URL,
  effectiveFrom: "2026-01-29",
  caps: DEFAULT_CAPS,
  needsReview: false,
};

/** Compat: objeto estilo legado usado em UI/PDF. */
export function rulesToRouanetShape(rules: ActiveRules) {
  return {
    code: rules.sourceCode,
    articles: {
      supplier: rules.caps.articles.supplier,
      proponent: rules.caps.articles.proponent,
      communication: "art. 20",
      supplierExceptions: rules.caps.articles.supplierExceptions,
    },
    supplierCapPct: rules.caps.supplierCapPct,
    proponentCapPct: rules.caps.proponentCapPct,
    proponentMeiCapPct: rules.caps.proponentMeiCapPct,
    nearCapPct: rules.caps.nearCapPct,
  } as const;
}

export const RELATION_LABELS: Record<RelationKind, string> = {
  SPOUSE: "Cônjuge",
  COMPANION: "Companheiro(a)",
  LINEAL_KIN: "Parente em linha reta",
  COLLATERAL_2ND: "Parente colateral até 2º grau (ex.: irmão)",
  COLLATERAL_3RD: "Parente 3º grau",
  AFFINITY: "Parente por afinidade",
  PARTNER: "Sem vínculo",
  AFFILIATED_COMPANY: "Coligada",
  COMMON_PARTNER: "Sócio em comum",
  COUPLE_PARTNERS: "Casal sócio nas duas empresas",
  /** Legado — UI trata como Sócio em comum */
  CORPORATE_MEMBER: "Sócio em comum",
  PROPONENT: "Sem vínculo",
  PROPONENT_PF: "Proponente PF",
  PROPONENT_PJ: "Proponente PJ",
  DIRECTOR_THIRD_SECTOR: "Diretor(a) terceiro setor",
  SAME_ADDRESS: "Mesmo endereço",
  OTHER: "Sem vínculo",
};

export const RELATION_HINTS: Record<RelationKind, string> = {
  SPOUSE: "Pessoa casada com sócio/administrador do proponente.",
  COMPANION: "Companheiro(a) em união estável com sócio/administrador do proponente.",
  LINEAL_KIN: "Pai, mãe, filho(a) etc.",
  COLLATERAL_2ND: "Irmão(ã), avô/avó, neto(a) etc. até 2º grau.",
  COLLATERAL_3RD: "Tio(a), sobrinho(a), bisavô/bisavó etc. (3º grau).",
  AFFINITY: "Parentesco por afinidade (sogro, cunhado etc.).",
  PARTNER: "Tipo legado — tratado como sem vínculo.",
  AFFILIATED_COMPANY: "Empresa coligada societariamente ao proponente.",
  COMMON_PARTNER: "Outra empresa que compartilha sócio(s) com o proponente.",
  COUPLE_PARTNERS:
    "Ex.: cônjuges/companheiros são sócios — um no proponente e outro (ou ambos) na empresa fornecedora. Use entre empresas (Vivas ↔ Ateliê 22).",
  CORPORATE_MEMBER: "Tipo legado — migrado para Sócio em comum / Coligada.",
  PROPONENT: "Tipo legado — tratado como sem vínculo.",
  PROPONENT_PF: "A parte é o próprio proponente pessoa física.",
  PROPONENT_PJ: "A parte é o próprio proponente pessoa jurídica.",
  DIRECTOR_THIRD_SECTOR:
    "Diretor(a) de entidade do terceiro setor — não gera vínculo art. 23.",
  SAME_ADDRESS: "Mesmo endereço cadastral do proponente.",
  OTHER: "Tipo legado — tratado como sem vínculo.",
};

export const RELATION_OPTION_GROUPS: Array<{
  label: string;
  options: RelationKind[];
}> = [
  {
    label: "Pessoas",
    options: [
      "PROPONENT_PF",
      "SPOUSE",
      "COMPANION",
      "LINEAL_KIN",
      "COLLATERAL_2ND",
      "COLLATERAL_3RD",
      "AFFINITY",
      "DIRECTOR_THIRD_SECTOR",
    ],
  },
  {
    label: "Empresas / societário",
    options: [
      "PROPONENT_PJ",
      "COMMON_PARTNER",
      "COUPLE_PARTNERS",
      "AFFILIATED_COMPANY",
    ],
  },
  {
    label: "Outros relacionamentos",
    options: ["SAME_ADDRESS"],
  },
];

export const RELATION_KIND_VALUES = Object.keys(RELATION_LABELS) as RelationKind[];

export function relationSelectValue(relation: string | null | undefined): string {
  if (!relation) return "";
  if (RELATION_LEGACY_AS_EMPTY.has(relation as RelationKind)) return "";
  // Legado do mapa societário → tipos do catálogo
  if (relation === "CORPORATE_MEMBER") return "COMMON_PARTNER";
  return relation;
}
