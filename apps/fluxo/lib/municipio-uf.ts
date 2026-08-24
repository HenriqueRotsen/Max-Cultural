import { stripAccents, normalizeUf, normalizeAddressLine } from "@/lib/normalize";
import municipiosUf from "@/data/municipios-uf.json";

const VALID_UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

const UF_NAMES: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

const LOOKUP = municipiosUf as Record<string, string>;

export function cityKey(name: string): string {
  const raw = stripAccents(String(name ?? "").trim().toLowerCase());
  return raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Extrai UF de sufixos tipo "Buriticupu-ma" ou "Cidade - Maranhão". */
export function parseUfSuffix(cidadeRaw: string): {
  cidade: string;
  estado: string;
} {
  const raw = String(cidadeRaw ?? "").trim();
  if (!raw) return { cidade: "", estado: "" };

  // "Foo - Maranhão" / "Foo/MA"
  const dashState = raw.match(
    /^(.+?)\s*[-–—/]\s*([A-Za-zÀ-ÿ\s]{2,})$/,
  );
  if (dashState) {
    const left = dashState[1]!.trim();
    const right = dashState[2]!.trim();
    const uf2 = normalizeUf(right);
    if (uf2.length === 2 && VALID_UFS.has(uf2)) {
      return { cidade: left, estado: uf2 };
    }
    const byName = UF_NAMES[stripAccents(right.toLowerCase())];
    if (byName) return { cidade: left, estado: byName };
  }

  // "Buriticupu-ma" no final (só UF válidas — evita "Pindaré-mirim")
  const short = raw.match(/^(.+?)[-\s]([a-zA-Z]{2})$/);
  if (short) {
    const uf = normalizeUf(short[2]);
    if (uf.length === 2 && VALID_UFS.has(uf)) {
      return { cidade: short[1]!.trim(), estado: uf };
    }
  }

  return { cidade: raw, estado: "" };
}

export function lookupUfByCidade(cidade: string): string {
  const key = cityKey(cidade);
  if (!key) return "";
  return LOOKUP[key] ?? "";
}

/** True se o texto corresponde a um município IBGE (com ou sem sufixo de UF). */
export function isKnownMunicipio(name: unknown): boolean {
  const raw = String(name ?? "").trim();
  if (!raw) return false;
  const full = normalizeAddressLine(raw);
  if (full && lookupUfByCidade(full)) return true;
  const parsed = parseUfSuffix(raw);
  if (parsed.estado && parsed.cidade !== raw) {
    const candidate = normalizeAddressLine(parsed.cidade);
    if (candidate && lookupUfByCidade(candidate)) return true;
  }
  return false;
}

/**
 * Completa cidade/estado a partir de texto legado.
 * - Se estado vazio e cidade conhecida → UF
 * - Se cidade vazia e territorio parece município → promove
 * - Se territorio é município (igual ou diferente da cidade) → vira cidade, não "comunidade"
 */
export function enrichCidadeEstado(input: {
  cidade?: string;
  estado?: string;
  territorio?: string;
}): { cidade: string; estado: string; territorio: string } {
  let cidade = normalizeAddressLine(input.cidade ?? "");
  let estado = normalizeUf(input.estado ?? "");
  let territorio = normalizeAddressLine(input.territorio ?? "");

  if (cidade) {
    const parsed = parseUfSuffix(cidade);
    if (parsed.estado && VALID_UFS.has(parsed.estado)) {
      cidade = normalizeAddressLine(parsed.cidade);
      if (!estado) estado = parsed.estado;
    }
  }

  if (!estado && cidade) {
    estado = lookupUfByCidade(cidade);
  }

  // Território que é município IBGE → é cidade, não comunidade aninhada
  if (territorio && isKnownMunicipio(territorio)) {
    const parsed = parseUfSuffix(territorio);
    const mun = normalizeAddressLine(parsed.cidade || territorio);
    const uf = parsed.estado || lookupUfByCidade(mun);
    const sameAsCidade =
      cidade && cityKey(cidade) === cityKey(mun);

    if (!cidade || sameAsCidade) {
      cidade = mun || cidade;
      if (uf) estado = estado || uf;
      territorio = "";
    } else {
      // cidade A + territorio município B (ex.: Marabá + Canaã) → local = B
      cidade = mun;
      estado = uf || estado || lookupUfByCidade(mun);
      territorio = "";
    }
  }

  // Território texto livre que é só nome de município (já coberto acima);
  // se cidade vazia e territorio não-município, mantém.

  if (!estado && cidade) {
    estado = lookupUfByCidade(cidade);
  }

  return { cidade, estado, territorio };
}
