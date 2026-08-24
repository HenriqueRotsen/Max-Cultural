/**
 * Pure price-tier helpers — safe for Client Components.
 * Do NOT import prisma here.
 *
 * Levels are numeric 1–4 (display as $–$$$$). Avoid "$" and "T1" string
 * codes in RSC props — React Flight has corrupted those in practice.
 */

export type PriceLevel = 1 | 2 | 3 | 4;

/** @deprecated Use PriceLevel — kept as alias during migration. */
export type PriceTier = PriceLevel;

export type TimeWindow = "all" | "year";

export type TrendDirection = "up" | "down" | "flat" | "unknown";

export const PRICE_LEVELS: PriceLevel[] = [1, 2, 3, 4];

/** @deprecated Use PRICE_LEVELS */
export const PRICE_TIERS = PRICE_LEVELS;

export type AxisTier = {
  level: PriceLevel | null;
  benchmark: number | null;
  deltaPct: number | null;
  sampleSize: number;
};

export type TierSummary = {
  cheap: number;
  normal: number;
  expensive: number;
  veryExpensive: number;
  none: number;
};

export function emptyTierSummary(): TierSummary {
  return { cheap: 0, normal: 0, expensive: 0, veryExpensive: 0, none: 0 };
}

export function bumpTierSummary(
  summary: TierSummary,
  level: PriceLevel | null,
) {
  if (level == null) summary.none += 1;
  else if (level === 1) summary.cheap += 1;
  else if (level === 2) summary.normal += 1;
  else if (level === 3) summary.expensive += 1;
  else summary.veryExpensive += 1;
}

export function formatTierSummary(summary: TierSummary): string {
  return (
    [
      summary.cheap > 0 ? `${summary.cheap} barato` : null,
      summary.normal > 0 ? `${summary.normal} normal` : null,
      summary.expensive > 0 ? `${summary.expensive} caro` : null,
      summary.veryExpensive > 0
        ? `${summary.veryExpensive} muito caro`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Sem comparação ainda"
  );
}

export function clampPriceLevel(level: number): PriceLevel {
  return Math.min(4, Math.max(1, Math.round(level))) as PriceLevel;
}

/** Display mark: 1 → $, 4 → $$$$. */
export function formatPriceLevel(level: PriceLevel): string {
  return "$".repeat(level);
}

/** @deprecated Use formatPriceLevel */
export function formatPriceTier(tier: PriceLevel): string {
  return formatPriceLevel(tier);
}

export function tierToLevel(tier: PriceLevel): number {
  return tier;
}

export function levelToTier(level: number): PriceLevel {
  return clampPriceLevel(level);
}

/** Compare unit price against a benchmark. Returns null if no benchmark. */
export function priceTier(
  unitPrice: number,
  benchmark: number | null | undefined,
): PriceLevel | null {
  if (benchmark == null || !Number.isFinite(benchmark) || benchmark <= 0) {
    return null;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;

  const delta = (unitPrice - benchmark) / benchmark;
  if (delta < -0.1) return 1;
  if (delta <= 0.1) return 2;
  if (delta <= 0.2) return 3;
  return 4;
}

/** Average of levels, rounded to nearest integer (1–4). */
export function averagePriceTiers(
  tiers: Array<PriceLevel | null | undefined>,
): PriceLevel | null {
  const levels = tiers.filter((t): t is PriceLevel => t != null);
  if (levels.length === 0) return null;
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  return clampPriceLevel(mean);
}

export function percentDelta(
  value: number,
  benchmark: number | null | undefined,
): number | null {
  if (benchmark == null || !Number.isFinite(benchmark) || benchmark === 0) {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  return ((value - benchmark) / benchmark) * 100;
}

export function classifyTrend(
  recent: number | null | undefined,
  previous: number | null | undefined,
  kind: "price" | "rating",
): TrendDirection {
  if (
    recent == null ||
    previous == null ||
    !Number.isFinite(recent) ||
    !Number.isFinite(previous)
  ) {
    return "unknown";
  }
  if (kind === "rating") {
    const d = recent - previous;
    if (Math.abs(d) < 0.3) return "flat";
    return d > 0 ? "up" : "down";
  }
  if (previous === 0) return recent === 0 ? "flat" : "unknown";
  const d = (recent - previous) / Math.abs(previous);
  if (Math.abs(d) < 0.05) return "flat";
  return d > 0 ? "up" : "down";
}

export function pickPrimaryTier(tiers: {
  category: AxisTier;
  state: AxisTier;
  city: AxisTier;
}): PriceLevel | null {
  // Kept for callers; prefer average of the three axes.
  return averageAxisLevels(tiers);
}

export type AxisLevels = {
  category: PriceLevel | null;
  state: PriceLevel | null;
  city: PriceLevel | null;
};

function readLevel(
  value: PriceLevel | null | AxisTier | { level: PriceLevel | null },
): PriceLevel | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return value.level;
}

/** Rounded mean of Cat / UF / Cidade levels (ignores nulls). */
export function averageAxisLevels(tiers: {
  category: PriceLevel | null | AxisTier | { level: PriceLevel | null };
  state: PriceLevel | null | AxisTier | { level: PriceLevel | null };
  city: PriceLevel | null | AxisTier | { level: PriceLevel | null };
}): PriceLevel | null {
  return averagePriceTiers([
    readLevel(tiers.category),
    readLevel(tiers.state),
    readLevel(tiers.city),
  ]);
}

export function axisLevelsFromTiers(tiers: {
  category: AxisTier;
  state: AxisTier;
  city: AxisTier;
}): AxisLevels {
  return {
    category: tiers.category.level,
    state: tiers.state.level,
    city: tiers.city.level,
  };
}

export type ServiceUnitInsight = {
  serviceId: string;
  serviceName: string;
  category: string | null;
  priceUnit: string;
  avgUnitPrice: { all: number | null; year: number | null; prior: number | null };
  avgRating: { all: number | null; year: number | null; prior: number | null };
  delayRate: { all: number | null; year: number | null };
  count: { all: number; year: number; prior: number };
  tiers: {
    all: { category: AxisTier; state: AxisTier; city: AxisTier };
    year: { category: AxisTier; state: AxisTier; city: AxisTier };
  };
  trend: {
    price: TrendDirection;
    rating: TrendDirection;
  };
};

export type SupplierInsights = {
  delayRate: { all: number | null; year: number | null };
  avgRating: { all: number | null; year: number | null; prior: number | null };
  ratingTrend: TrendDirection;
  avgTier: { all: PriceLevel | null; year: PriceLevel | null };
  serviceTiers: {
    all: Record<string, PriceLevel | null>;
    year: Record<string, PriceLevel | null>;
  };
  /** Cat / UF / Cid levels per service (for popup breakdown). */
  serviceAxes: {
    all: Record<string, AxisLevels>;
    year: Record<string, AxisLevels>;
  };
  /** Supplier-level Cat / UF / Cid (avg across services). */
  avgAxes: { all: AxisLevels; year: AxisLevels };
  services: ServiceUnitInsight[];
  tierSummary: {
    all: TierSummary;
    year: TierSummary;
  };
};

export type MarketServiceRow = {
  serviceId: string;
  serviceName: string;
  supplierId: string;
  supplierName: string;
  category: string | null;
  priceUnit: string;
  avgUnitPrice: number;
  delayRate: number | null;
  avgRating: number | null;
  tiers: { category: AxisTier; state: AxisTier; city: AxisTier };
  trend: { price: TrendDirection; rating: TrendDirection };
};
