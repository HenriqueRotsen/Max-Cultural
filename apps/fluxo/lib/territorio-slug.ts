import { stripAccents, normalizeUf } from "@/lib/normalize";
import { isOnlineRow, onlineLabel } from "@/lib/territorio-online";

/** Slug de uma parte (cidade, comunidade): sem acento, minúsculo, hífens. */
export function slugifyPart(value: unknown): string {
  const raw = stripAccents(String(value ?? "").trim().toLowerCase());
  return raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function slugifyUf(value: unknown): string {
  return normalizeUf(value).toLowerCase();
}

export function buildTerritorioPath(parts: {
  estado?: string;
  cidade?: string;
  territorio?: string;
  nomeOficina?: string;
  online?: boolean;
}): string {
  const online =
    parts.online === true ||
    isOnlineRow({
      territorio: parts.territorio,
      cidade: parts.cidade,
      nomeOficina: parts.nomeOficina,
    });

  if (online) {
    const label = onlineLabel({
      territorio: parts.territorio,
      nomeOficina: parts.nomeOficina,
    });
    const slug = slugifyPart(label) || "online";
    return `/territorio/online/${slug}`;
  }

  const uf = slugifyUf(parts.estado);
  if (!uf || uf === "online") return "/territorio";
  const segments = ["/territorio", uf];
  const cidade = slugifyPart(parts.cidade);
  if (cidade) {
    segments.push(cidade);
    const terr = slugifyPart(parts.territorio);
    if (terr) segments.push(terr);
  }
  return segments.join("/");
}

export function matchesSlug(canonical: string, slug: string): boolean {
  return slugifyPart(canonical) === slugifyPart(slug);
}

export function formatTerritorioBreadcrumb(parts: {
  estado?: string;
  cidade?: string;
  territorio?: string;
  online?: boolean;
}): string {
  if (parts.online) {
    return ["Online", parts.territorio].filter(Boolean).join(" · ");
  }
  const bits = [normalizeUf(parts.estado ?? "")];
  if (parts.cidade?.trim()) bits.push(parts.cidade.trim());
  if (parts.territorio?.trim()) bits.push(parts.territorio.trim());
  return bits.filter(Boolean).join(" · ");
}
