import municipiosCoords from "@/data/municipios-coords.json";
import { cityKey, lookupUfByCidade } from "@/lib/municipio-uf";
import { normalizeAddressLine, normalizeUf } from "@/lib/normalize";

const COORDS = municipiosCoords as Record<string, [number, number]>;

function pair(
  latLng: [number, number] | undefined,
): { lat: number; lng: number } | null {
  if (!latLng) return null;
  return { lat: latLng[0], lng: latLng[1] };
}

export function hasMunicipioCoords(cidade: string, estado: string): boolean {
  const uf = normalizeUf(estado);
  const slug = cityKey(cidade);
  return Boolean(uf && slug && COORDS[`${uf}|${slug}`]);
}

/**
 * Centroide IBGE do município. Independente de Nominatim/geo_cache.
 * Regiões administrativas do DF sem município próprio caem em Brasília.
 */
export function lookupMunicipioCoords(
  cidade: string,
  estado: string,
): { lat: number; lng: number } | null {
  const city = normalizeAddressLine(cidade);
  const slug = cityKey(city);
  if (!slug) return null;

  const uf = normalizeUf(estado);
  if (uf) {
    const hit = pair(COORDS[`${uf}|${slug}`]);
    if (hit) return hit;
  }

  const ibgeUf = lookupUfByCidade(city);
  if (ibgeUf && ibgeUf !== uf) {
    const hit = pair(COORDS[`${ibgeUf}|${slug}`]);
    if (hit) return hit;
  }

  if (uf === "DF") {
    return pair(COORDS["DF|brasilia"]);
  }

  return null;
}
