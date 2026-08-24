export const SERVICE_CATEGORIES = [
  { value: "construcao_reforma", label: "Construção e reforma" },
  { value: "ti_tecnologia", label: "TI e tecnologia" },
  { value: "logistica_transporte", label: "Logística e transporte" },
  { value: "energia", label: "Energia" },
  { value: "facilities_limpeza", label: "Facilities e limpeza" },
  { value: "manutencao", label: "Manutenção" },
  { value: "engenharia_consultoria", label: "Engenharia e consultoria" },
  { value: "juridico", label: "Jurídico" },
  { value: "contabil_financeiro", label: "Contábil e financeiro" },
  { value: "marketing_comunicacao", label: "Marketing e comunicação" },
  { value: "seguranca", label: "Segurança" },
  { value: "rh_recrutamento", label: "RH e recrutamento" },
  { value: "alimentacao_eventos", label: "Alimentação e eventos" },
  { value: "outros", label: "Outros" },
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]["value"];

const CATEGORY_VALUES = new Set<string>(
  SERVICE_CATEGORIES.map((c) => c.value),
);

const LABEL_BY_VALUE = Object.fromEntries(
  SERVICE_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<ServiceCategory, string>;

/** Aliases antigos / livres → valor canônico */
const LEGACY_MAP: Record<string, ServiceCategory> = {
  construção: "construcao_reforma",
  construcao: "construcao_reforma",
  reforma: "construcao_reforma",
  ti: "ti_tecnologia",
  tecnologia: "ti_tecnologia",
  informática: "ti_tecnologia",
  informatica: "ti_tecnologia",
  logística: "logistica_transporte",
  logistica: "logistica_transporte",
  transporte: "logistica_transporte",
  frete: "logistica_transporte",
  energia: "energia",
  solar: "energia",
  facilities: "facilities_limpeza",
  limpeza: "facilities_limpeza",
  manutenção: "manutencao",
  manutencao: "manutencao",
  engenharia: "engenharia_consultoria",
  consultoria: "engenharia_consultoria",
  jurídico: "juridico",
  juridico: "juridico",
  contábil: "contabil_financeiro",
  contabil: "contabil_financeiro",
  financeiro: "contabil_financeiro",
  marketing: "marketing_comunicacao",
  comunicação: "marketing_comunicacao",
  comunicacao: "marketing_comunicacao",
  segurança: "seguranca",
  seguranca: "seguranca",
  rh: "rh_recrutamento",
  recrutamento: "rh_recrutamento",
  alimentação: "alimentacao_eventos",
  alimentacao: "alimentacao_eventos",
  eventos: "alimentacao_eventos",
  outros: "outros",
};

export function isServiceCategory(value: string): value is ServiceCategory {
  return CATEGORY_VALUES.has(value);
}

export function parseServiceCategory(
  value: string | null | undefined,
): ServiceCategory | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isServiceCategory(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  if (LEGACY_MAP[lower]) return LEGACY_MAP[lower];

  // tenta match parcial no label
  const byLabel = SERVICE_CATEGORIES.find(
    (c) => c.label.toLowerCase() === lower || c.label.toLowerCase().includes(lower),
  );
  return byLabel?.value ?? null;
}

export function getCategoryLabel(value: string | null | undefined): string {
  if (!value) return "Sem categoria";
  if (isServiceCategory(value)) return LABEL_BY_VALUE[value];
  const normalized = parseServiceCategory(value);
  if (normalized) return LABEL_BY_VALUE[normalized];
  return value;
}
