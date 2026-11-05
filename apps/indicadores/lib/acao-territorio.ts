import {
  enrichCidadeEstado,
  isKnownMunicipio,
  parseAgendaLocalLabel,
} from "@/lib/municipio-uf";

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

export type AcaoTerritorioRef = {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
};

export type AcaoTerritorioAliasRef = {
  rawNormalized: string;
  online: boolean;
  acaoTerritorioId?: string | null;
  cidade?: string;
  estado?: string;
  territorio?: string;
};

export type AcaoTerritorioCatalog = {
  ofereceOnline: boolean;
  oferecePresencial: boolean;
  territorios: AcaoTerritorioRef[];
  aliases?: AcaoTerritorioAliasRef[];
};

export type ParseTerritorioInscricaoResult = {
  online: boolean;
  cidade: string;
  estado: string;
  /** Comunidade / rótulo online / vazio */
  territorio: string;
  acaoTerritorioId: string | null;
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
export function acaoTerritorioLabel(t: {
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

export function buildAcaoTerritorioOpcoes(catalog: AcaoTerritorioCatalog): string[] {
  const opts: string[] = [];
  if (catalog.ofereceOnline) opts.push(ONLINE_TERRITORIO_LABEL);
  if (catalog.oferecePresencial) {
    const sorted = [...catalog.territorios].sort(
      (a, b) =>
        a.cidade.localeCompare(b.cidade, "pt-BR") ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
    for (const t of sorted) {
      const label = acaoTerritorioLabel(t);
      if (label && !opts.includes(label)) opts.push(label);
    }
  }
  return opts;
}

export function resolveAcaoTerritorioChoice(
  choice: string,
  catalog: AcaoTerritorioCatalog,
): ParseTerritorioInscricaoResult {
  const raw = String(choice ?? "").trim();
  if (!raw) {
    return {
      online: false,
      cidade: "",
      estado: "",
      territorio: "",
      acaoTerritorioId: null,
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
      acaoTerritorioId: null,
      matched: true,
      label: ONLINE_TERRITORIO_LABEL,
    };
  }

  const key = normalizeTerritorioRawKey(raw);
  for (const t of catalog.territorios) {
    const label = acaoTerritorioLabel(t);
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
        acaoTerritorioId: t.id,
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
    acaoTerritorioId: null,
    matched: false,
    label: raw,
  };
}

/**
 * Normaliza valor de planilha/formulário para Cidade/Estado/Territorio,
 * casando com o catálogo da ação quando disponível.
 */
export function parseTerritorioInscricao(
  raw: unknown,
  catalog?: AcaoTerritorioCatalog | null,
): ParseTerritorioInscricaoResult {
  const text = String(raw ?? "").trim();
  if (!text) {
    return {
      online: false,
      cidade: "",
      estado: "",
      territorio: "",
      acaoTerritorioId: null,
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
          acaoTerritorioId: null,
          matched: true,
          label: ONLINE_TERRITORIO_LABEL,
        };
      }
      if (alias.acaoTerritorioId) {
        const t = catalog.territorios.find(
          (x) => x.id === alias.acaoTerritorioId,
        );
        if (t) {
          return {
            online: false,
            cidade: t.cidade,
            estado: t.estado,
            territorio: String(t.nome ?? "").trim(),
            acaoTerritorioId: t.id,
            matched: true,
            label: acaoTerritorioLabel(t),
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
          acaoTerritorioId: null,
          matched: true,
          label: acaoTerritorioLabel({ nome: territorio, cidade, estado }),
        };
      }
    }
  }

  if (catalog) {
    const fromCatalog = resolveAcaoTerritorioChoice(text, catalog);
    if (fromCatalog.matched) return fromCatalog;
  }

  if (looksLikeOnlineKeyword(text)) {
    if (!catalog || catalog.ofereceOnline) {
      return {
        online: true,
        cidade: "",
        estado: "",
        territorio: ONLINE_TERRITORIO_LABEL,
        acaoTerritorioId: null,
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
            acaoTerritorioId: hit.id,
            matched: true,
            label: acaoTerritorioLabel(hit),
          };
        }
      }
      return {
        online: false,
        cidade: enriched.cidade,
        estado: enriched.estado,
        territorio: "",
        acaoTerritorioId: null,
        matched: false,
        label: acaoTerritorioLabel({
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
          acaoTerritorioId: hit.id,
          matched: true,
          label: acaoTerritorioLabel(hit),
        };
      }
    }
    return {
      online: false,
      cidade: enriched.cidade,
      estado: enriched.estado,
      territorio: normalizeAddressLine(right),
      acaoTerritorioId: null,
      matched: false,
      label: text,
    };
  }

  const agenda = parseAgendaLocalLabel(text);
  if (agenda) {
    if (catalog?.territorios.length) {
      const hit = catalog.territorios.find(
        (t) =>
          normalizeTerritorioRawKey(t.cidade) ===
            normalizeTerritorioRawKey(agenda.cidade) &&
          t.estado.toUpperCase() === agenda.estado.toUpperCase() &&
          normalizeTerritorioRawKey(t.nome) ===
            normalizeTerritorioRawKey(agenda.territorio),
      );
      if (hit) {
        return {
          online: false,
          cidade: hit.cidade,
          estado: hit.estado,
          territorio: String(hit.nome ?? "").trim(),
          acaoTerritorioId: hit.id,
          matched: true,
          label: acaoTerritorioLabel(hit),
        };
      }
    }
    return {
      online: false,
      cidade: agenda.cidade,
      estado: agenda.estado,
      territorio: agenda.territorio,
      acaoTerritorioId: null,
      matched: true,
      label: acaoTerritorioLabel({
        nome: agenda.territorio,
        cidade: agenda.cidade,
        estado: agenda.estado,
      }),
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
          acaoTerritorioId: hit.id,
          matched: true,
          label: acaoTerritorioLabel(hit),
        };
      }
    }
    return {
      online: false,
      cidade: enriched.cidade,
      estado: enriched.estado,
      territorio: "",
      acaoTerritorioId: null,
      matched: false,
      label: acaoTerritorioLabel({
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
        acaoTerritorioId: hit.id,
        matched: true,
        label: acaoTerritorioLabel(hit),
      };
    }
  }

  return {
    online: false,
    cidade: "",
    estado: "",
    territorio: normalizeAddressLine(text),
    acaoTerritorioId: null,
    matched: false,
    label: text,
  };
}

export function catalogFromAcaoParts(parts: {
  ofereceOnline?: boolean;
  oferecePresencial?: boolean;
  territorios?: Array<{
    id: string;
    nome: string;
    cidade: string;
    estado: string;
  }>;
  aliases?: AcaoTerritorioAliasRef[];
}): AcaoTerritorioCatalog {
  return {
    ofereceOnline: Boolean(parts.ofereceOnline),
    oferecePresencial: parts.oferecePresencial !== false,
    territorios: parts.territorios ?? [],
    aliases: parts.aliases,
  };
}

/** Regras de UI/template: quantas opções e se a pergunta é obrigatória. */
export function territorioAcaoFieldMeta(catalog: AcaoTerritorioCatalog): {
  opcoes: string[];
  showField: boolean;
  obrigatorio: boolean;
  autoChoice: string | null;
} {
  const opcoes = buildAcaoTerritorioOpcoes(catalog);
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

export type TerritorioAcaoFormValue = {
  modalidade: "ONLINE" | "PRESENCIAL" | "";
  cidade: string;
  estado: string;
  territorio: string;
};

export const EMPTY_TERRITORIO_ACAO_FORM: TerritorioAcaoFormValue = {
  modalidade: "",
  cidade: "",
  estado: "",
  territorio: "",
};

/** Meta do campo composto (modalidade + cidade/UF/território). */
export function territorioAcaoStructuredMeta(
  catalog: AcaoTerritorioCatalog | null,
): {
  ofereceOnline: boolean;
  oferecePresencial: boolean;
  /** Se só uma modalidade: pré-seleciona e esconde o rádio. */
  autoModalidade: "ONLINE" | "PRESENCIAL" | null;
  showField: boolean;
} {
  const ofereceOnline = Boolean(catalog?.ofereceOnline);
  const oferecePresencial = catalog ? catalog.oferecePresencial !== false : true;
  if (!ofereceOnline && !oferecePresencial) {
    return {
      ofereceOnline: false,
      oferecePresencial: false,
      autoModalidade: null,
      showField: false,
    };
  }
  if (ofereceOnline && !oferecePresencial) {
    return {
      ofereceOnline: true,
      oferecePresencial: false,
      autoModalidade: "ONLINE",
      showField: true,
    };
  }
  if (!ofereceOnline && oferecePresencial) {
    return {
      ofereceOnline: false,
      oferecePresencial: true,
      autoModalidade: "PRESENCIAL",
      showField: true,
    };
  }
  return {
    ofereceOnline: true,
    oferecePresencial: true,
    autoModalidade: null,
    showField: true,
  };
}

export function asTerritorioAcaoFormValue(
  raw: unknown,
): TerritorioAcaoFormValue {
  if (!raw || typeof raw !== "object") {
    // Compat: string antiga (label Online ou Cidade/UF)
    const s = String(raw ?? "").trim();
    if (!s) return { ...EMPTY_TERRITORIO_ACAO_FORM };
    if (looksLikeOnlineKeyword(s) || s === ONLINE_TERRITORIO_LABEL) {
      return {
        modalidade: "ONLINE",
        cidade: "",
        estado: "",
        territorio: ONLINE_TERRITORIO_LABEL,
      };
    }
    return {
      modalidade: "PRESENCIAL",
      cidade: "",
      estado: "",
      territorio: s,
    };
  }
  const o = raw as Record<string, unknown>;
  const mod = String(o.modalidade ?? "").toUpperCase();
  return {
    modalidade:
      mod === "ONLINE" || mod === "PRESENCIAL"
        ? (mod as "ONLINE" | "PRESENCIAL")
        : "",
    cidade: String(o.cidade ?? o.Cidade ?? "").trim(),
    estado: String(o.estado ?? o.Estado ?? o.uf ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 2),
    territorio: String(o.territorio ?? o.Territorio ?? "").trim(),
  };
}

export function applyTerritorioAcaoFormToSiga(
  sigaPartial: Record<string, unknown>,
  value: TerritorioAcaoFormValue,
  catalog?: AcaoTerritorioCatalog | null,
): { acaoTerritorioId: string | null; online: boolean } {
  if (value.modalidade === "ONLINE") {
    // Mantém Cidade/Estado do endereço residencial, se já preenchidos.
    sigaPartial.Territorio = ONLINE_TERRITORIO_LABEL;
    return { acaoTerritorioId: null, online: true };
  }
  if (value.modalidade === "PRESENCIAL") {
    const cidade = value.cidade.trim();
    const estado = value.estado.trim().toUpperCase();
    const territorio = value.territorio.trim();
    sigaPartial.Cidade = cidade;
    sigaPartial.Estado = estado;
    sigaPartial.Territorio = territorio;
    if (catalog?.territorios.length) {
      const hit = catalog.territorios.find(
        (t) =>
          normalizeTerritorioRawKey(t.cidade) ===
            normalizeTerritorioRawKey(cidade) &&
          t.estado.toUpperCase() === estado &&
          (!territorio ||
            normalizeTerritorioRawKey(t.nome) ===
              normalizeTerritorioRawKey(territorio)),
      );
      if (hit) {
        return { acaoTerritorioId: hit.id, online: false };
      }
    }
    return { acaoTerritorioId: null, online: false };
  }
  return { acaoTerritorioId: null, online: false };
}
