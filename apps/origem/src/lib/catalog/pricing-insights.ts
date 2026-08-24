import { prisma } from "@/lib/db";
import {
  averageAxisLevels,
  averagePriceTiers,
  bumpTierSummary,
  classifyTrend,
  emptyTierSummary,
  percentDelta,
  priceTier,
  type AxisLevels,
  type AxisTier,
  type PriceLevel,
  type ServiceUnitInsight,
  type SupplierInsights,
} from "@/lib/catalog/price-tiers";

export type {
  AxisLevels,
  AxisTier,
  PriceLevel,
  ServiceUnitInsight,
  SupplierInsights,
} from "@/lib/catalog/price-tiers";
export {
  averageAxisLevels,
  formatPriceLevel,
  formatTierSummary,
} from "@/lib/catalog/price-tiers";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function yearCutoff(now = new Date()): Date {
  return new Date(now.getTime() - YEAR_MS);
}

type BenchRow = {
  category: string;
  state: string | null;
  city: string | null;
  price_unit: string;
  window: string;
  avg_unit: number;
  sample: bigint;
};

type EngRow = {
  id: string;
  serviceProductId: string;
  serviceName: string;
  category: string | null;
  priceUnit: string;
  unitPrice: number;
  rating: number | null;
  delayed: boolean;
  hiredAt: Date;
  supplierState: string | null;
  supplierCity: string | null;
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function delayPct(rows: EngRow[]): number | null {
  if (rows.length === 0) return null;
  return (rows.filter((r) => r.delayed).length / rows.length) * 100;
}

function makeAxis(
  unitPrice: number | null,
  bench: number | null,
  sample: number,
  excludeOwn: boolean,
): AxisTier {
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return { level: null, benchmark: bench, deltaPct: null, sampleSize: sample };
  }
  const usable = excludeOwn ? sample >= 2 : sample >= 1;
  if (!usable || bench == null || !Number.isFinite(bench) || bench <= 0) {
    // Sem pares comparáveis: o próprio preço é a referência ($$).
    return {
      level: 2,
      benchmark: unitPrice,
      deltaPct: 0,
      sampleSize: sample,
    };
  }
  return {
    level: priceTier(unitPrice, bench),
    benchmark: bench,
    deltaPct: percentDelta(unitPrice, bench),
    sampleSize: sample,
  };
}

function benchKey(
  category: string,
  priceUnit: string,
  state?: string | null,
  city?: string | null,
) {
  return `${category}||${priceUnit}||${state ?? ""}||${city ?? ""}`;
}

function emptyInsights(): SupplierInsights {
  return {
    delayRate: { all: null, year: null },
    avgRating: { all: null, year: null, prior: null },
    ratingTrend: "unknown",
    avgTier: { all: null, year: null },
    serviceTiers: { all: {}, year: {} },
    serviceAxes: { all: {}, year: {} },
    avgAxes: {
      all: { category: null, state: null, city: null },
      year: { category: null, state: null, city: null },
    },
    services: [],
    tierSummary: { all: emptyTierSummary(), year: emptyTierSummary() },
  };
}

export async function getSupplierInsights(
  workspaceId: string,
  supplierId: string,
): Promise<SupplierInsights> {
  const supplier = await prisma.catalogSupplier.findFirst({
    where: { id: supplierId, workspaceId },
    include: { services: { include: { engagements: true } } },
  });
  if (!supplier) return emptyInsights();

  const cutoff = yearCutoff();
  const engagements: EngRow[] = supplier.services.flatMap((s) =>
    s.engagements.map((e) => {
      const unit = Number(e.unitPrice);
      const total = Number(e.price);
      return {
        id: e.id,
        serviceProductId: s.id,
        serviceName: s.name,
        category: s.category,
        priceUnit: e.priceUnit,
        unitPrice: unit > 0 ? unit : total,
        rating: e.rating,
        delayed: e.delayed,
        hiredAt: e.hiredAt,
        supplierState: supplier.state,
        supplierCity: supplier.city,
      };
    }),
  );

  const benches = await prisma.$queryRaw<BenchRow[]>`
    SELECT
      COALESCE(sp.category, 'outros') as category,
      s.state as state,
      s.city as city,
      e."priceUnit" as price_unit,
      CASE
        WHEN e."hiredAt" >= ${cutoff} THEN 'year'
        ELSE 'prior'
      END as window,
      AVG(e."unitPrice")::float as avg_unit,
      COUNT(*)::bigint as sample
    FROM catalog_engagements e
    JOIN catalog_services sp ON sp.id = e."serviceId"
    JOIN catalog_suppliers s ON s.id = sp."supplierId"
    WHERE e."workspaceId" = ${workspaceId}
    GROUP BY 1, 2, 3, 4, 5
  `;

  const benchesAll = await prisma.$queryRaw<
    Array<{
      category: string;
      state: string | null;
      city: string | null;
      price_unit: string;
      avg_unit: number;
      sample: bigint;
    }>
  >`
    SELECT
      COALESCE(sp.category, 'outros') as category,
      s.state as state,
      s.city as city,
      e."priceUnit" as price_unit,
      AVG(e."unitPrice")::float as avg_unit,
      COUNT(*)::bigint as sample
    FROM catalog_engagements e
    JOIN catalog_services sp ON sp.id = e."serviceId"
    JOIN catalog_suppliers s ON s.id = sp."supplierId"
    WHERE e."workspaceId" = ${workspaceId}
    GROUP BY 1, 2, 3, 4
  `;

  type BenchMap = Map<string, { avg: number; sample: number }>;

  function accumulate(
    map: BenchMap,
    rows: Array<{
      category: string;
      state: string | null;
      city: string | null;
      price_unit: string;
      avg_unit: number;
      sample: bigint;
    }>,
    mode: "cat" | "state" | "city",
  ) {
    const buckets = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      const key =
        mode === "cat"
          ? benchKey(r.category, r.price_unit)
          : mode === "state"
            ? benchKey(r.category, r.price_unit, r.state)
            : benchKey(r.category, r.price_unit, r.state, r.city);
      const n = Number(r.sample);
      const cur = buckets.get(key) ?? { sum: 0, n: 0 };
      cur.sum += r.avg_unit * n;
      cur.n += n;
      buckets.set(key, cur);
    }
    for (const [k, v] of buckets) {
      map.set(k, { avg: v.n ? v.sum / v.n : 0, sample: v.n });
    }
  }

  const allCat = new Map<string, { avg: number; sample: number }>();
  const allState = new Map<string, { avg: number; sample: number }>();
  const allCity = new Map<string, { avg: number; sample: number }>();
  accumulate(allCat, benchesAll, "cat");
  accumulate(allState, benchesAll, "state");
  accumulate(allCity, benchesAll, "city");

  const yearRows = benches.filter((b) => b.window === "year");
  const yearCat = new Map<string, { avg: number; sample: number }>();
  const yearState = new Map<string, { avg: number; sample: number }>();
  const yearCity = new Map<string, { avg: number; sample: number }>();
  accumulate(yearCat, yearRows, "cat");
  accumulate(yearState, yearRows, "state");
  accumulate(yearCity, yearRows, "city");

  const groupKeys = new Map<string, EngRow[]>();
  for (const e of engagements) {
    const k = `${e.serviceProductId}::${e.priceUnit}`;
    const list = groupKeys.get(k) ?? [];
    list.push(e);
    groupKeys.set(k, list);
  }

  const services: ServiceUnitInsight[] = [];
  const tierSummary = { all: emptyTierSummary(), year: emptyTierSummary() };

  function externalSample(
    map: Map<string, { avg: number; sample: number }>,
    key: string,
    ownCount: number,
  ) {
    const b = map.get(key);
    if (!b) return { avg: null as number | null, sample: 0 };
    return { avg: b.avg, sample: Math.max(0, b.sample - ownCount) };
  }

  for (const [, rows] of groupKeys) {
    const sample = rows[0]!;
    const category = sample.category || "outros";
    const priceUnit = sample.priceUnit;
    const yearRowsG = rows.filter((r) => r.hiredAt >= cutoff);
    const priorRowsG = rows.filter((r) => r.hiredAt < cutoff);
    const avgAll = avg(rows.map((r) => r.unitPrice));
    const avgYear = avg(yearRowsG.map((r) => r.unitPrice));
    const avgPrior = avg(priorRowsG.map((r) => r.unitPrice));
    const ratingsAll = rows.map((r) => r.rating).filter((r): r is number => r != null);
    const ratingsYear = yearRowsG.map((r) => r.rating).filter((r): r is number => r != null);
    const ratingsPrior = priorRowsG.map((r) => r.rating).filter((r): r is number => r != null);
    const ownAll = rows.length;
    const ownYear = yearRowsG.length;

    const catAll = externalSample(allCat, benchKey(category, priceUnit), ownAll);
    const stateAll = externalSample(
      allState,
      benchKey(category, priceUnit, supplier.state),
      ownAll,
    );
    const cityAll = externalSample(
      allCity,
      benchKey(category, priceUnit, supplier.state, supplier.city),
      ownAll,
    );
    const catYear = externalSample(yearCat, benchKey(category, priceUnit), ownYear);
    const stateYear = externalSample(
      yearState,
      benchKey(category, priceUnit, supplier.state),
      ownYear,
    );
    const cityYear = externalSample(
      yearCity,
      benchKey(category, priceUnit, supplier.state, supplier.city),
      ownYear,
    );

    const tiers = {
      all: {
        category: makeAxis(avgAll, catAll.avg, catAll.sample, true),
        state: makeAxis(avgAll, stateAll.avg, stateAll.sample, true),
        city: makeAxis(avgAll, cityAll.avg, cityAll.sample, true),
      },
      year: {
        category: makeAxis(avgYear, catYear.avg, catYear.sample, true),
        state: makeAxis(avgYear, stateYear.avg, stateYear.sample, true),
        city: makeAxis(avgYear, cityYear.avg, cityYear.sample, true),
      },
    };

    bumpTierSummary(tierSummary.all, averageAxisLevels(tiers.all));
    bumpTierSummary(tierSummary.year, averageAxisLevels(tiers.year));

    services.push({
      serviceId: sample.serviceProductId,
      serviceName: sample.serviceName,
      category: sample.category,
      priceUnit,
      avgUnitPrice: { all: avgAll, year: avgYear, prior: avgPrior },
      avgRating: {
        all: avg(ratingsAll),
        year: avg(ratingsYear),
        prior: avg(ratingsPrior),
      },
      delayRate: { all: delayPct(rows), year: delayPct(yearRowsG) },
      count: { all: rows.length, year: yearRowsG.length, prior: priorRowsG.length },
      tiers,
      trend: {
        price: classifyTrend(avgYear, avgPrior, "price"),
        rating: classifyTrend(avg(ratingsYear), avg(ratingsPrior), "rating"),
      },
    });
  }

  services.sort((a, b) => a.serviceName.localeCompare(b.serviceName, "pt-BR"));

  const serviceTiersAll: Record<string, PriceLevel | null> = {};
  const serviceTiersYear: Record<string, PriceLevel | null> = {};
  const serviceAxesAll: Record<string, AxisLevels> = {};
  const serviceAxesYear: Record<string, AxisLevels> = {};
  const byServiceId = new Map<string, ServiceUnitInsight[]>();
  for (const svc of services) {
    const list = byServiceId.get(svc.serviceId) ?? [];
    list.push(svc);
    byServiceId.set(svc.serviceId, list);
  }
  for (const [serviceId, list] of byServiceId) {
    const axesAll: AxisLevels = {
      category: averagePriceTiers(list.map((s) => s.tiers.all.category.level)),
      state: averagePriceTiers(list.map((s) => s.tiers.all.state.level)),
      city: averagePriceTiers(list.map((s) => s.tiers.all.city.level)),
    };
    const axesYear: AxisLevels = {
      category: averagePriceTiers(list.map((s) => s.tiers.year.category.level)),
      state: averagePriceTiers(list.map((s) => s.tiers.year.state.level)),
      city: averagePriceTiers(list.map((s) => s.tiers.year.city.level)),
    };
    serviceAxesAll[serviceId] = axesAll;
    serviceAxesYear[serviceId] = axesYear;
    serviceTiersAll[serviceId] = averageAxisLevels(axesAll);
    serviceTiersYear[serviceId] = averageAxisLevels(axesYear);
  }

  const allRatings = engagements.map((e) => e.rating).filter((r): r is number => r != null);
  const yearRatings = engagements
    .filter((e) => e.hiredAt >= cutoff)
    .map((e) => e.rating)
    .filter((r): r is number => r != null);
  const priorRatings = engagements
    .filter((e) => e.hiredAt < cutoff)
    .map((e) => e.rating)
    .filter((r): r is number => r != null);

  // Valor é obrigatório: todo serviço cadastrado recebe $–$$$$.
  // Sem pares no último ano, usa o histórico; sem benchmark, $$ (preço próprio).
  for (const svc of supplier.services) {
    serviceTiersAll[svc.id] = serviceTiersAll[svc.id] ?? 2;
    serviceTiersYear[svc.id] =
      serviceTiersYear[svc.id] ?? serviceTiersAll[svc.id] ?? 2;
    if (!axisHasLevel(serviceAxesAll[svc.id])) {
      serviceAxesAll[svc.id] = NEUTRAL_AXES;
    }
    if (!axisHasLevel(serviceAxesYear[svc.id])) {
      serviceAxesYear[svc.id] = serviceAxesAll[svc.id] ?? NEUTRAL_AXES;
    }
  }

  const filledAxesAll: AxisLevels = {
    category: averagePriceTiers(Object.values(serviceAxesAll).map((a) => a.category)),
    state: averagePriceTiers(Object.values(serviceAxesAll).map((a) => a.state)),
    city: averagePriceTiers(Object.values(serviceAxesAll).map((a) => a.city)),
  };
  const filledAxesYear: AxisLevels = {
    category: averagePriceTiers(Object.values(serviceAxesYear).map((a) => a.category)),
    state: averagePriceTiers(Object.values(serviceAxesYear).map((a) => a.state)),
    city: averagePriceTiers(Object.values(serviceAxesYear).map((a) => a.city)),
  };
  const displayAxesAll = axisHasLevel(filledAxesAll) ? filledAxesAll : NEUTRAL_AXES;
  const displayAxesYear = axisHasLevel(filledAxesYear)
    ? filledAxesYear
    : displayAxesAll;

  return {
    delayRate: {
      all: delayPct(engagements),
      year: delayPct(engagements.filter((e) => e.hiredAt >= cutoff)),
    },
    avgRating: {
      all: avg(allRatings),
      year: avg(yearRatings),
      prior: avg(priorRatings),
    },
    ratingTrend: classifyTrend(avg(yearRatings), avg(priorRatings), "rating"),
    avgTier: {
      all: averageAxisLevels(displayAxesAll) ?? 2,
      year: averageAxisLevels(displayAxesYear) ?? 2,
    },
    serviceTiers: { all: serviceTiersAll, year: serviceTiersYear },
    serviceAxes: { all: serviceAxesAll, year: serviceAxesYear },
    avgAxes: { all: displayAxesAll, year: displayAxesYear },
    services,
    tierSummary,
  };
}

function axisHasLevel(axes: AxisLevels | undefined): boolean {
  if (!axes) return false;
  return axes.category != null || axes.state != null || axes.city != null;
}

const NEUTRAL_AXES: AxisLevels = { category: 2, state: 2, city: 2 };

export type YearTierMark = {
  level: PriceLevel;
  axes: AxisLevels;
};

export async function getYearTiersForSuppliers(
  workspaceId: string,
  supplierIds: string[],
): Promise<{
  suppliers: Map<string, YearTierMark>;
  services: Map<string, YearTierMark>;
}> {
  const suppliers = new Map<string, YearTierMark>();
  const services = new Map<string, YearTierMark>();
  await Promise.all(
    supplierIds.map(async (id) => {
      const insights = await getSupplierInsights(workspaceId, id);
      suppliers.set(id, {
        level: insights.avgTier.year ?? insights.avgTier.all ?? 2,
        axes: axisHasLevel(insights.avgAxes.year)
          ? insights.avgAxes.year
          : axisHasLevel(insights.avgAxes.all)
            ? insights.avgAxes.all
            : NEUTRAL_AXES,
      });
      const serviceIds = new Set([
        ...Object.keys(insights.serviceTiers.year),
        ...Object.keys(insights.serviceTiers.all),
      ]);
      for (const serviceId of serviceIds) {
        const level =
          insights.serviceTiers.year[serviceId] ??
          insights.serviceTiers.all[serviceId] ??
          2;
        const axes = axisHasLevel(insights.serviceAxes.year[serviceId])
          ? insights.serviceAxes.year[serviceId]!
          : axisHasLevel(insights.serviceAxes.all[serviceId])
            ? insights.serviceAxes.all[serviceId]!
            : NEUTRAL_AXES;
        services.set(serviceId, { level, axes });
      }
    }),
  );
  return { suppliers, services };
}
