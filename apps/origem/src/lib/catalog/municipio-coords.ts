import municipiosCoords from "@/data/municipios-coords.json";

const COORDS = municipiosCoords as Record<string, [number, number]>;

function cityKey(name: string): string {
  const raw = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function pair(
  latLng: [number, number] | undefined,
): { lat: number; lng: number } | null {
  if (!latLng) return null;
  return { lat: latLng[0], lng: latLng[1] };
}

/** Centroide IBGE do município (UF + nome). RAs do DF caem em Brasília. */
export function lookupMunicipioCoords(
  cidade: string | null | undefined,
  estado: string | null | undefined,
): { lat: number; lng: number } | null {
  const slug = cityKey(cidade || "");
  const uf = String(estado || "")
    .trim()
    .toUpperCase();
  if (!slug) return null;

  if (uf.length === 2) {
    const hit = pair(COORDS[`${uf}|${slug}`]);
    if (hit) return hit;
  }

  if (uf === "DF") {
    return pair(COORDS["DF|brasilia"]);
  }

  return null;
}

export function coordsFromSupplier(supplier: {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
}): { lat: number; lng: number } | null {
  if (
    supplier.latitude != null &&
    supplier.longitude != null &&
    Number.isFinite(supplier.latitude) &&
    Number.isFinite(supplier.longitude)
  ) {
    return { lat: supplier.latitude, lng: supplier.longitude };
  }
  return lookupMunicipioCoords(supplier.city, supplier.state);
}
