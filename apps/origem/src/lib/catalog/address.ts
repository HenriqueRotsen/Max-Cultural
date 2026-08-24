/**
 * Endereço no padrão IBGE (CNEFE / Faces de Logradouro):
 * NM_TIP_LOG + nome + número + complemento + bairro + município + UF + CEP.
 *
 * Tipos de logradouro: vocabulário usual do campo NM_TIP_LOG do IBGE
 * (e alinhado ao DNE dos Correios). Municípios via API de Localidades do IBGE.
 */

export const LOGRADOURO_TYPES = [
  "Acesso",
  "Aeroporto",
  "Alameda",
  "Área",
  "Avenida",
  "Beco",
  "Boulevard",
  "Campo",
  "Caminho",
  "Chácara",
  "Colônia",
  "Condomínio",
  "Conjunto",
  "Distrito",
  "Esplanada",
  "Estação",
  "Estrada",
  "Favela",
  "Fazenda",
  "Feira",
  "Jardim",
  "Ladeira",
  "Lago",
  "Lagoa",
  "Largo",
  "Loteamento",
  "Morro",
  "Núcleo",
  "Parque",
  "Passagem",
  "Pátio",
  "Praça",
  "Quadra",
  "Recanto",
  "Residencial",
  "Rodovia",
  "Rua",
  "Setor",
  "Sítio",
  "Travessa",
  "Trecho",
  "Trevo",
  "Vale",
  "Vereda",
  "Via",
  "Viaduto",
  "Viela",
  "Vila",
] as const;

export type LogradouroType = (typeof LOGRADOURO_TYPES)[number];

/** Siglas oficiais IBGE (UF). */
export const BRAZIL_UF = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
] as const;

export type BrazilUf = (typeof BRAZIL_UF)[number]["sigla"];

export type AddressParts = {
  streetType?: string | null;
  streetName?: string | null;
  streetNumber?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  cityIbgeCode?: string | null;
  state?: string | null;
  zipCode?: string | null;
  /** Linha legada quando os campos estruturados estão vazios */
  address?: string | null;
};

export type Municipality = {
  id: string;
  name: string;
};

const TYPE_ALIASES: Record<string, LogradouroType> = {
  r: "Rua",
  rua: "Rua",
  av: "Avenida",
  avenida: "Avenida",
  al: "Alameda",
  alameda: "Alameda",
  tv: "Travessa",
  trav: "Travessa",
  travessa: "Travessa",
  pc: "Praça",
  pça: "Praça",
  praca: "Praça",
  praça: "Praça",
  rod: "Rodovia",
  rodovia: "Rodovia",
  estr: "Estrada",
  estrada: "Estrada",
  via: "Via",
  vl: "Vila",
  vila: "Vila",
  jd: "Jardim",
  jardim: "Jardim",
  beco: "Beco",
  lg: "Largo",
  largo: "Largo",
  qd: "Quadra",
  quadra: "Quadra",
  st: "Setor",
  setor: "Setor",
  cond: "Condomínio",
  condomínio: "Condomínio",
  condominio: "Condomínio",
  cj: "Conjunto",
  conjunto: "Conjunto",
  passagem: "Passagem",
  pátio: "Pátio",
  patio: "Pátio",
  área: "Área",
  area: "Área",
  sitio: "Sítio",
  sítio: "Sítio",
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.$/, "")
    .trim();
}

export function matchLogradouroType(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const key = normalizeKey(trimmed);
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  const exact = LOGRADOURO_TYPES.find((t) => normalizeKey(t) === key);
  return exact || null;
}

/** Separa "Av. Paulista" / "Rua das Flores" em tipo + nome. */
export function splitStreetLine(logradouro: string | null | undefined): {
  streetType: string | null;
  streetName: string | null;
} {
  const raw = (logradouro || "").trim();
  if (!raw) return { streetType: null, streetName: null };

  const parts = raw.split(/\s+/);
  if (parts.length === 1) {
    const asType = matchLogradouroType(parts[0]);
    if (asType) return { streetType: asType, streetName: null };
    return { streetType: null, streetName: raw };
  }

  for (const take of [2, 1] as const) {
    const head = parts.slice(0, take).join(" ");
    const rest = parts.slice(take).join(" ").trim();
    const matched = matchLogradouroType(head);
    if (matched && rest) {
      return { streetType: matched, streetName: rest };
    }
  }

  return { streetType: null, streetName: raw };
}

/**
 * Extrai número (e opcional complemento) de trechos como "1000" ou "1000, sala 12".
 * Também entende linhas legadas "Av. Paulista, 1000".
 */
export function parseLegacyAddressLine(line: string | null | undefined): {
  streetType: string | null;
  streetName: string | null;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
} {
  const raw = (line || "").trim();
  if (!raw) {
    return {
      streetType: null,
      streetName: null,
      streetNumber: null,
      complement: null,
      neighborhood: null,
    };
  }

  // "Tipo Nome, 123 - complemento, Bairro" ou "Tipo Nome, 123"
  const commaParts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const streetPart = commaParts[0];
    const second = commaParts[1];
    const restNeighborhood =
      commaParts.length >= 3 ? commaParts.slice(2).join(", ") : null;

    const numMatch = second.match(
      /^(\d+[A-Za-z]?|S\/N)(?:\s*[-–]\s*(.+))?$/i,
    );
    if (numMatch) {
      const split = splitStreetLine(streetPart);
      return {
        ...split,
        streetNumber: numMatch[1].toUpperCase() === "S/N" ? "S/N" : numMatch[1],
        complement: numMatch[2]?.trim() || null,
        neighborhood: restNeighborhood,
      };
    }

    // Segunda parte pode ser bairro
    const split = splitStreetLine(streetPart);
    return {
      ...split,
      streetNumber: null,
      complement: null,
      neighborhood: commaParts.slice(1).join(", "),
    };
  }

  const split = splitStreetLine(raw);
  return {
    ...split,
    streetNumber: null,
    complement: null,
    neighborhood: null,
  };
}

export function formatStreetLine(parts: AddressParts): string | null {
  const type = (parts.streetType || "").trim();
  const name = (parts.streetName || "").trim();
  const line = [type, name].filter(Boolean).join(" ").trim();
  return line || null;
}

export function formatFullAddress(parts: AddressParts): string | null {
  const street = formatStreetLine(parts);
  const number = (parts.streetNumber || "").trim();
  const complement = (parts.complement || "").trim();
  const neighborhood = (parts.neighborhood || "").trim();

  const head = [street, number].filter(Boolean).join(", ");
  const withComplement = [head, complement].filter(Boolean).join(" - ");
  const full = [withComplement, neighborhood].filter(Boolean).join(", ");
  return full || (parts.address || "").trim() || null;
}

export function formatAddressDisplay(parts: AddressParts): string {
  const line = formatFullAddress(parts);
  const cityUf = [parts.city, parts.state].filter(Boolean).join(" / ");
  const zip = (parts.zipCode || "").replace(/\D/g, "");
  const cep =
    zip.length === 8 ? `CEP ${zip.slice(0, 5)}-${zip.slice(5)}` : null;
  return [line, cityUf, cep].filter(Boolean).join(" · ") || "—";
}

export async function fetchMunicipalitiesByUf(
  uf: string,
): Promise<Municipality[]> {
  const sigla = uf.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(sigla)) return [];

  const res = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios?orderBy=nome`,
    {
      headers: { Accept: "application/json", "User-Agent": "MAX-Origem/1.0" },
      next: { revalidate: 86400 * 7 },
    },
  );
  if (!res.ok) return [];

  const data = (await res.json()) as Array<{ id: number; nome: string }>;
  return data.map((m) => ({
    id: String(m.id),
    name: m.nome,
  }));
}

export function findMunicipality(
  list: Municipality[],
  cityName: string | null | undefined,
): Municipality | null {
  if (!cityName) return null;
  const key = normalizeKey(cityName);
  return (
    list.find((m) => normalizeKey(m.name) === key) ||
    list.find((m) => normalizeKey(m.name).includes(key)) ||
    null
  );
}
