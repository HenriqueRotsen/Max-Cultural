import { prisma } from "@/lib/prisma";
import { normalizeUf, normalizeAddressLine } from "@/lib/normalize";
import {
  hasMunicipioCoords,
  lookupMunicipioCoords,
} from "@/lib/municipio-coords";
import { lookupUfByCidade } from "@/lib/municipio-uf";

export type CityCoords = {
  key: string;
  cidade: string;
  estado: string;
  lat: number;
  lng: number;
  displayName: string;
};

/** Nome do estado em PT (como o Nominatim costuma devolver). */
const UF_STATE_NAME: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

export function geoCacheKey(cidade: string, estado: string): string {
  const uf = normalizeUf(estado);
  const city = normalizeAddressLine(cidade);
  return `cidade|${uf}|${city}`;
}

type NominatimHit = {
  lat: string;
  lon: string;
  display_name?: string;
  addresstype?: string;
  class?: string;
  type?: string;
  importance?: number;
  address?: {
    state?: string;
    municipality?: string;
    city?: string;
    town?: string;
    village?: string;
    "ISO3166-2-lvl4"?: string;
  };
};

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function hitMatchesUf(hit: NominatimHit, uf: string): boolean {
  const iso = hit.address?.["ISO3166-2-lvl4"];
  if (iso) {
    const code = iso.split("-").pop()?.toUpperCase();
    if (code) return code === uf;
  }
  const state = hit.address?.state;
  const expected = UF_STATE_NAME[uf];
  if (state && expected && fold(state) === fold(expected)) return true;

  const dn = hit.display_name ?? "";
  if (!dn || !expected) return false;
  // Ex.: "Bacabeira, Maranhão, Região Nordeste, Brasil"
  return fold(dn).includes(fold(expected));
}

function scoreHit(hit: NominatimHit): number {
  let score = hit.importance ?? 0;
  const t = `${hit.addresstype ?? ""} ${hit.type ?? ""}`.toLowerCase();
  if (t.includes("municipality") || t.includes("administrative")) score += 1;
  if (t.includes("city") || t.includes("town")) score += 0.5;
  if (t.includes("hamlet") || t.includes("neighbourhood")) score -= 0.5;
  return score;
}

async function nominatimSearch(
  params: Record<string, string>,
): Promise<NominatimHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "br");

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": `${appName}/1.0 (territorio-map; local-dev)`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  return (await res.json()) as NominatimHit[];
}

function pickBestForUf(
  hits: NominatimHit[],
  uf: string,
): { lat: number; lng: number; displayName: string } | null {
  const matched = hits.filter((h) => hitMatchesUf(h, uf));
  if (!matched.length) return null;
  matched.sort((a, b) => scoreHit(b) - scoreHit(a));
  const hit = matched[0]!;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    displayName: hit.display_name ?? "",
  };
}

/**
 * Geocodifica município/UF. Descarta resultados de outro estado
 * (ex.: "Bacabeira, BA" → povoado em Altamira/PA).
 */
async function fetchNominatim(
  cidade: string,
  estado: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const uf = normalizeUf(estado);
  const city = normalizeAddressLine(cidade);
  if (!uf || !city) return null;

  const stateName = UF_STATE_NAME[uf] ?? uf;

  // 1) Busca estruturada (cidade + estado)
  const structured = await nominatimSearch({
    city,
    state: stateName,
    country: "Brasil",
    limit: "5",
  });
  const fromStructured = pickBestForUf(structured, uf);
  if (fromStructured) return fromStructured;

  // 2) Query livre, ainda filtrando pela UF pedida
  const free = await nominatimSearch({
    q: `${city}, ${stateName}, Brasil`,
    limit: "5",
  });
  const fromFree = pickBestForUf(free, uf);
  if (fromFree) return fromFree;

  // 3) Se a UF informada diverge do IBGE, tenta a UF canônica do município
  const ibgeUf = lookupUfByCidade(city);
  if (ibgeUf && ibgeUf !== uf) {
    const ibgeName = UF_STATE_NAME[ibgeUf] ?? ibgeUf;
    const ibgeHits = await nominatimSearch({
      city,
      state: ibgeName,
      country: "Brasil",
      limit: "5",
    });
    const fromIbge = pickBestForUf(ibgeHits, ibgeUf);
    if (fromIbge) return fromIbge;
  }

  return null;
}

/**
 * UF efetiva para geocode/cache: se o município IBGE tem UF única
 * diferente da informada, usa a do IBGE (corrige Bacabeira/BA → MA).
 */
export function resolveGeoUf(cidade: string, estado: string): string {
  const uf = normalizeUf(estado);
  const city = normalizeAddressLine(cidade);
  // RAs do DF (Ceilândia, Planaltina…) não são municípios IBGE.
  if (uf === "DF") return "DF";
  // Homônimos: se a UF informada existe no IBGE, não realocar (Campo Grande/MS).
  if (uf && hasMunicipioCoords(city, uf)) return uf;
  const ibgeUf = lookupUfByCidade(city);
  if (ibgeUf && uf && ibgeUf !== uf) return ibgeUf;
  return ibgeUf || uf;
}

/** Busca lat/lng no cache; se faltar, geocodifica via Nominatim e grava. */
export async function ensureCityCoords(
  cidade: string,
  estado: string,
): Promise<CityCoords | null> {
  const city = normalizeAddressLine(cidade);
  const uf = resolveGeoUf(cidade, estado);
  if (!uf || !city) return null;

  const key = geoCacheKey(city, uf);
  const cached = await prisma.geoCache.findUnique({ where: { key } });
  if (cached) {
    // Cache antigo sem validação (ex.: Bacabeira/BA → Pará)
    if (hitMatchesUf(
      {
        lat: String(cached.lat),
        lon: String(cached.lng),
        display_name: cached.displayName,
      },
      uf,
    )) {
      return {
        key: cached.key,
        cidade: cached.cidade,
        estado: cached.estado,
        lat: cached.lat,
        lng: cached.lng,
        displayName: cached.displayName,
      };
    }
    // Regeocodifica e sobrescreve
  }

  const local = lookupMunicipioCoords(city, uf);
  const geo = local
    ? {
        lat: local.lat,
        lng: local.lng,
        displayName: `${city}, ${UF_STATE_NAME[uf] ?? uf}, Brasil`,
      }
    : await fetchNominatim(city, uf);
  if (!geo) return null;

  const saved = await prisma.geoCache.upsert({
    where: { key },
    create: {
      key,
      cidade: city,
      estado: uf,
      lat: geo.lat,
      lng: geo.lng,
      displayName: geo.displayName,
    },
    update: {
      lat: geo.lat,
      lng: geo.lng,
      displayName: geo.displayName,
      estado: uf,
      cidade: city,
    },
  });

  return {
    key: saved.key,
    cidade: saved.cidade,
    estado: saved.estado,
    lat: saved.lat,
    lng: saved.lng,
    displayName: saved.displayName,
  };
}

export async function ensureManyCityCoords(
  cities: Array<{ cidade: string; estado: string }>,
): Promise<CityCoords[]> {
  const out: CityCoords[] = [];
  const seen = new Set<string>();
  for (const c of cities) {
    const key = geoCacheKey(
      normalizeAddressLine(c.cidade),
      resolveGeoUf(c.cidade, c.estado),
    );
    if (seen.has(key)) continue;
    seen.add(key);
    const coords = await ensureCityCoords(c.cidade, c.estado);
    if (coords) out.push(coords);
    // Nominatim: máx ~1 req/s
    await new Promise((r) => setTimeout(r, 1100));
  }
  return out;
}
