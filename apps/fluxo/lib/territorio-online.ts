import { stripAccents } from "@/lib/normalize";
import { isKnownMunicipio } from "@/lib/municipio-uf";

const ONLINE_OFICINA_RE =
  /\b(online|aul[aã]o\s*online|remoto|ead|virtual|a\s*distancia|à\s*dist[aâ]ncia)\b/i;

function looksLikeOnlineOficina(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const norm = stripAccents(raw.toLowerCase());
  return ONLINE_OFICINA_RE.test(norm) || norm.includes("online");
}

/**
 * No campo território: tudo que não for município conhecido é online
 * (ex.: "Online", "Aulão Online", "material didatico Roboizinho").
 */
export function isOnlineTerritorio(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (isKnownMunicipio(raw)) return false;
  return true;
}

export function isOnlineRow(parts: {
  territorio?: string;
  cidade?: string;
  nomeOficina?: string;
}): boolean {
  const terr = String(parts.territorio ?? "").trim();
  if (terr) return isOnlineTerritorio(terr);
  // Sem território: só marca online se o nome da oficina indicar e não houver cidade
  if (looksLikeOnlineOficina(parts.nomeOficina) && !parts.cidade?.trim()) {
    return true;
  }
  return false;
}

/** Rótulo canônico para slug online. */
export function onlineLabel(parts: {
  territorio?: string;
  nomeOficina?: string;
}): string {
  const t = String(parts.territorio ?? "").trim();
  if (t && isOnlineTerritorio(t)) return t;
  if (t && !isKnownMunicipio(t)) return t;
  const o = String(parts.nomeOficina ?? "").trim();
  if (o && looksLikeOnlineOficina(o)) return o;
  if (t) return t;
  if (o) return o;
  return "Online";
}
