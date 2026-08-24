export const PRICE_UNITS = [
  { value: "closed", label: "Valor fechado (verba)", symbol: "verba" },
  { value: "hour", label: "Por hora", symbol: "/h" },
  { value: "day", label: "Por diária", symbol: "/dia" },
  { value: "week", label: "Por semana", symbol: "/sem" },
  { value: "month", label: "Por mês", symbol: "/mês" },
  { value: "year", label: "Por ano", symbol: "/ano" },
  { value: "m2", label: "Por m²", symbol: "/m²" },
  { value: "m3", label: "Por m³", symbol: "/m³" },
  { value: "ml", label: "Por metro linear", symbol: "/m" },
  { value: "unit", label: "Por unidade / peça", symbol: "/un" },
  { value: "kit", label: "Por kit / pacote", symbol: "/kit" },
  { value: "kg", label: "Por kg", symbol: "/kg" },
  { value: "ton", label: "Por tonelada", symbol: "/t" },
  { value: "liter", label: "Por litro", symbol: "/L" },
  { value: "km", label: "Por km", symbol: "/km" },
  { value: "trip", label: "Por viagem / frete", symbol: "/viagem" },
  { value: "visit", label: "Por visita", symbol: "/visita" },
  { value: "service_call", label: "Por chamado", symbol: "/chamado" },
  { value: "person", label: "Por pessoa", symbol: "/pessoa" },
  { value: "seat", label: "Por posto / assento", symbol: "/posto" },
  { value: "license", label: "Por licença", symbol: "/licença" },
  { value: "project", label: "Por projeto", symbol: "/projeto" },
] as const;

export type PriceUnit = (typeof PRICE_UNITS)[number]["value"];

const UNIT_VALUES = new Set<string>(PRICE_UNITS.map((u) => u.value));

const LABEL_BY_VALUE = Object.fromEntries(
  PRICE_UNITS.map((u) => [u.value, u.label]),
) as Record<PriceUnit, string>;

const SYMBOL_BY_VALUE = Object.fromEntries(
  PRICE_UNITS.map((u) => [u.value, u.symbol]),
) as Record<PriceUnit, string>;

export function isPriceUnit(value: string): value is PriceUnit {
  return UNIT_VALUES.has(value);
}

export function parsePriceUnit(
  value: string | null | undefined,
): PriceUnit | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isPriceUnit(trimmed)) return trimmed;
  return null;
}

export function getPriceUnitLabel(value: string | null | undefined): string {
  if (!value) return LABEL_BY_VALUE.closed;
  if (isPriceUnit(value)) return LABEL_BY_VALUE[value];
  return value;
}

export function getPriceUnitSymbol(value: string | null | undefined): string {
  if (!value) return SYMBOL_BY_VALUE.closed;
  if (isPriceUnit(value)) return SYMBOL_BY_VALUE[value];
  return value;
}

export function computeTotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity * 100) / 100;
}
