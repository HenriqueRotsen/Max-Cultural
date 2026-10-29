import { stripAccents } from "@/lib/normalize";
import {
  isKnownMunicipio,
  parseAgendaLocalLabel,
} from "@/lib/municipio-uf";
import { looksLikeOnlineKeyword } from "@/lib/oficina-territorio";

const ONLINE_OFICINA_RE =
  /\b(online|aul[aã]o\s*online|remoto|ead|virtual|a\s*distancia|à\s*dist[aâ]ncia)\b/i;

function looksLikeOnlineOficina(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const norm = stripAccents(raw.toLowerCase());
  return ONLINE_OFICINA_RE.test(norm) || norm.includes("online");
}

/** Rótulo explícito de modalidade online. */
export function isOnlineTerritorio(value: unknown): boolean {
  return looksLikeOnlineKeyword(value);
}

export function isOnlineRow(parts: {
  territorio?: string;
  cidade?: string;
  nomeOficina?: string;
}): boolean {
  const terr = String(parts.territorio ?? "").trim();
  const cidade = String(parts.cidade ?? "").trim();
  if (looksLikeOnlineKeyword(terr)) return true;
  if (parseAgendaLocalLabel(terr)) return false;
  if (cidade && isKnownMunicipio(cidade)) return false;
  if (terr && isKnownMunicipio(terr)) return false;
  // Legado: território preenchido sem cidade e sem município conhecido
  if (terr && !cidade) return true;
  if (looksLikeOnlineOficina(parts.nomeOficina) && !cidade) {
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
