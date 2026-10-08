import { enrichCidadeEstado, isKnownMunicipio } from "@/lib/municipio-uf";

export const ONLINE_TERRITORIO_LABEL = "Online";

const ONLINE_KEYWORD_RE =
  /\b(online|aul[aã]o\s*online|remoto|ead|virtual|a\s*distancia|à\s*dist[aâ]ncia)\b/i;

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeAddressLine(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function parseTerritorioComposto(value: unknown): {
  cidade: string;
  territorio: string;
} {
  const raw = String(value ?? "").trim().replace(/\s*\/\s*/g, "/");
  if (!raw) return { cidade: "", territorio: "" };
  const idx = raw.indexOf("/");
  if (idx === -1) {
    return { cidade: "", territorio: normalizeAddressLine(raw) };
  }
  return {
    cidade: normalizeAddressLine(raw.slice(0, idx)),
    territorio: normalizeAddressLine(raw.slice(idx + 1)),
  };
}

export type OficinaTerritorioRef = {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
};

export type OficinaTerritorioAliasRef = {
  rawNormalized: string;
  online: boolean;
  oficinaTerritorioId?: string | null;
  cidade?: string;
  estado?: string;
  territorio?: string;
};

export type OficinaTerritorioCatalog = {
  ofereceOnline: boolean;
  oferecePresencial: boolean;
  territorios: OficinaTerritorioRef[];
  aliases?: OficinaTerritorioAliasRef[];
};

export type ParseTerritorioInscricaoResult = {
  online: boolean;
  cidade: string;
  estado: string;
  /** Comunidade / rótulo online / vazio */
  territorio: string;
  oficinaTerritorioId: string | null;
  matched: boolean;
  /** Label canônico da opção (Online ou Cidade/UF · nome) */
  label: string;
};

export function normalizeTerritorioRawKey(raw: unknown): string {
  return stripAccents(String(raw ?? ""))
    .trim()
    .toLowerCase()
    .replace(/[?!:;,()[\]{}"'`´]/g, " ")
    .replace(/[\s./\\+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeOnlineKeyword(raw: unknown): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  const norm = stripAccents(s.toLowerCase());
  return ONLINE_KEYWORD_RE.test(norm) || norm === "online";
}

/** Label canônico: `Online` | `Imperatriz/MA` | `Imperatriz/MA · Quilombo X` */
export function oficinaTerritorioLabel(t: {
  nome?: string | null;
  cidade: string;
  estado: string;
}): string {
  const cidade = String(t.cidade ?? "").trim();
  const estado = String(t.estado ?? "").trim().toUpperCase();
  const nome = String(t.nome ?? "").trim();
  const cityUf =
    cidade && estado ? `${cidade}/${estado}` : cidade || estado || "";
  if (nome && cityUf) return `${cityUf} · ${nome}`;
  if (nome) return nome;
  return cityUf;
}

export function buildOficinaTerritorioOpcoes(catalog: OficinaTerritorioCatalog): string[] {
  const opts: string[] = [];
  if (catalog.ofereceOnline) opts.push(ONLINE_TERRITORIO_LABEL);
  if (catalog.oferecePresencial) {
    const sorted = [...catalog.territorios].sort(
      (a, b) =>
        a.cidade.localeCompare(b.cidade, "pt-BR") ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
    for (const t of sorted) {
      const label = oficinaTerritorioLabel(t);
      if (label && !opts.includes(label)) opts.push(label);
    }
  }
  return opts;
}

export function resolveOficinaTerritorioChoice(
  choice: string,
  catalog: OficinaTerritorioCatalog,
): ParseTerritorioInscricaoResult {
  const raw = String(choice ?? "").trim();
  if (!raw) {
    return {
      online: false,
      cidade: "",
      estado: "",
      territorio: "",
      oficinaTerritorioId: null,
      matched: false,
      label: "",
    };
  }

  if (
    catalog.ofereceOnline &&
    (raw === ONLINE_TERRITORIO_LABEL || looksLikeOnlineKeyword(raw))
  ) {
    return {
      online: true,
      cidade: "",
      estado: "",
      territorio: ONLINE_TERRITORIO_LABEL,
      oficinaTerritorioId: null,
      matched: true,
      label: ONLINE_TERRITORIO_LABEL,
    };
  }

  const key = normalizeTerritorioRawKey(raw);
  for (const t of catalog.territorios) {
    const label = oficinaTerritorioLabel(t);
    if (
      normalizeTerritorioRawKey(label) === key ||
      normalizeTerritorioRawKey(t.nome) === key ||
      normalizeTerritorioRawKey(`${t.cidade}/${t.estado}`) === key ||
      normalizeTerritorioRawKey(t.cidade) === key
    ) {
      return {
        online: false,
        cidade: t.cidade,
        estado: t.estado,
        territorio: String(t.nome ?? "").trim(),
        oficinaTerritorioId: t.id,
        matched: true,
        label,
      };
    }
  }

  return {
    online: false,
    cidade: "",
    estado: "",
    territorio: raw,
    oficinaTerritorioId: null,
    matched: false,
    label: raw,
  };
}

/**
 * Normaliza valor de planilha/formulário para Cidade/Estado/Territorio,
 * casando com o catálogo da oficina quando disponível.
 */
export function parseTerritorioInscricao(
  raw: unknown,
  catalog?: OficinaTerritorioCatalog | null,
): ParseTerritorioInscricaoResult {
  const text = String(raw ?? "").trim();
  if (!text) {
    return {
      online: false,
      cidade: "",
      estado: "",
      territorio: "",
      oficinaTerritorioId: null,
      matched: false,
      label: "",
    };
  }

  const key = normalizeTerritorioRawKey(text);

  if (catalog?.aliases?.length) {
    const alias = catalog.aliases.find((a) => a.rawNormalized === key);
    if (alias) {
      if (alias.online) {
        return {
          online: true,
          cidade: "",
          estado: "",
          territorio: ONLINE_TERRITORIO_LABEL,
          oficinaTerritorioId: null,
          matched: true,
          label: ONLINE_TERRITORIO_LABEL,
        };
      }
      if (alias.oficinaTerritorioId) {
        const t = catalog.territorios.find(
          (x) => x.id === alias.oficinaTerritorioId,
        );
        if (t) {
          return {
            online: false,
            cidade: t.cidade,
            estado: t.estado,
            territorio: String(t.nome ?? "").trim(),
            oficinaTerritorioId: t.id,
            matched: true,
            label: oficinaTerritorioLabel(t),
          };
        }
      }
      const cidade = String(alias.cidade ?? "").trim();
      const estado = String(alias.estado ?? "").trim().toUpperCase();
      const territorio = String(alias.territorio ?? "").trim();
      if (cidade || estado || territorio) {
        return {
          online: false,
          cidade,
          estado,
          territorio,
          oficinaTerritorioId: null,
          matched: true,
          label: oficinaTerritorioLabel({ nome: territorio, cidade, estado }),
        };
      }
    }
  }

  if (catalog) {
    const fromCatalog = resolveOficinaTerritorioChoice(text, catalog);
    if (fromCatalog.matched) return fromCatalog;
  }

  if (looksLikeOnlineKeyword(text)) {
    if (!catalog || catalog.ofereceOnline) {
      return {
        online: true,
        cidade: "",
        estado: "",
        territorio: ONLINE_TERRITORIO_LABEL,
        oficinaTerritorioId: null,
        matched: Boolean(!catalog || catalog.ofereceOnline),
        label: ONLINE_TERRITORIO_LABEL,
      };
    }
  }

  if (text.includes("/")) {
    const parsed = parseTerritorioComposto(text);
    // "Cidade/UF" vs "Cidade/Comunidade"
    const right = parsed.territorio;
    const rightIsUf = /^[A-Za-z]{2}$/.test(right);
    if (rightIsUf && parsed.cidade) {
      const enriched = enrichCidadeEstado({
        cidade: parsed.cidade,
        estado: right,
        territorio: "",
      });
      if (catalog?.territorios.length) {
        const hit = catalog.territorios.find(
          (t) =>
            normalizeTerritorioRawKey(t.cidade) ===
              normalizeTerritorioRawKey(enriched.cidade) &&
            t.estado.toUpperCase() === enriched.estado.toUpperCase() &&
            !String(t.nome ?? "").trim(),
        );
        if (hit) {
          return {
            online: false,
            cidade: hit.cidade,
            estado: hit.estado,
            territorio: "",
            oficinaTerritorioId: hit.id,
            matched: true,
            label: oficinaTerritorioLabel(hit),
          };
        }
      }
      return {
        online: false,
        cidade: enriched.cidade,
        estado: enriched.estado,
        territorio: "",
        oficinaTerritorioId: null,
        matched: false,
        label: oficinaTerritorioLabel({
          cidade: enriched.cidade,
          estado: enriched.estado,
        }),
      };
    }

    const enriched = enrichCidadeEstado({
      cidade: parsed.cidade,
      estado: "",
      territorio: right,
    });
    if (catalog?.territorios.length) {
      const hit = catalog.territorios.find(
        (t) =>
          normalizeTerritorioRawKey(t.cidade) ===
            normalizeTerritorioRawKey(enriched.cidade) &&
          normalizeTerritorioRawKey(t.nome) === normalizeTerritorioRawKey(right),
      );
      if (hit) {
        return {
          online: false,
          cidade: hit.cidade,
          estado: hit.estado,
          territorio: String(hit.nome ?? "").trim(),
          oficinaTerritorioId: hit.id,
          matched: true,
          label: oficinaTerritorioLabel(hit),
        };
      }
    }
    return {
      online: false,
      cidade: enriched.cidade,
      estado: enriched.estado,
      territorio: normalizeAddressLine(right),
      oficinaTerritorioId: null,
      matched: false,
      label: text,
    };
  }

  if (isKnownMunicipio(text)) {
    const enriched = enrichCidadeEstado({
      cidade: text,
      estado: "",
      territorio: "",
    });
    if (catalog?.territorios.length) {
      const hit = catalog.territorios.find(
        (t) =>
          normalizeTerritorioRawKey(t.cidade) ===
          normalizeTerritorioRawKey(enriched.cidade),
      );
      if (hit) {
        return {
          online: false,
          cidade: hit.cidade,
          estado: hit.estado,
          territorio: String(hit.nome ?? "").trim(),
          oficinaTerritorioId: hit.id,
          matched: true,
          label: oficinaTerritorioLabel(hit),
        };
      }
    }
    return {
      online: false,
      cidade: enriched.cidade,
      estado: enriched.estado,
      territorio: "",
      oficinaTerritorioId: null,
      matched: false,
      label: oficinaTerritorioLabel({
        cidade: enriched.cidade,
        estado: enriched.estado,
      }),
    };
  }

  // Texto livre (comunidade) — tenta casar só pelo nome
  if (catalog?.territorios.length) {
    const byNome = catalog.territorios.filter(
      (t) => normalizeTerritorioRawKey(t.nome) === key,
    );
    if (byNome.length === 1) {
      const hit = byNome[0]!;
      return {
        online: false,
        cidade: hit.cidade,
        estado: hit.estado,
        territorio: String(hit.nome ?? "").trim(),
        oficinaTerritorioId: hit.id,
        matched: true,
        label: oficinaTerritorioLabel(hit),
      };
    }
  }

  return {
    online: false,
    cidade: "",
    estado: "",
    territorio: normalizeAddressLine(text),
    oficinaTerritorioId: null,
    matched: false,
    label: text,
  };
}

export function catalogFromOficinaParts(parts: {
  ofereceOnline?: boolean;
  oferecePresencial?: boolean;
  territorios?: Array<{
    id: string;
    nome: string;
    cidade: string;
    estado: string;
  }>;
  aliases?: OficinaTerritorioAliasRef[];
}): OficinaTerritorioCatalog {
  return {
    ofereceOnline: Boolean(parts.ofereceOnline),
    oferecePresencial: parts.oferecePresencial !== false,
    territorios: parts.territorios ?? [],
    aliases: parts.aliases,
  };
}

/** Regras de UI/template: quantas opções e se a pergunta é obrigatória. */
export function territorioOficinaFieldMeta(catalog: OficinaTerritorioCatalog): {
  opcoes: string[];
  showField: boolean;
  obrigatorio: boolean;
  autoChoice: string | null;
} {
  const opcoes = buildOficinaTerritorioOpcoes(catalog);
  if (opcoes.length === 0) {
    return { opcoes, showField: false, obrigatorio: false, autoChoice: null };
  }
  if (opcoes.length === 1) {
    return {
      opcoes,
      showField: false,
      obrigatorio: false,
      autoChoice: opcoes[0]!,
    };
  }
  return { opcoes, showField: true, obrigatorio: true, autoChoice: null };
}
