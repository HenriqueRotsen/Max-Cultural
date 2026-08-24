import { normalizeCgccpf } from "@/lib/format";
import {
  formatFullAddress,
  splitStreetLine,
  type AddressParts,
} from "@/lib/catalog/address";

export type CnpjLookupResult = {
  cnpj: string;
  name: string;
  tradeName: string | null;
  phone: string | null;
  email: string | null;
  streetType: string | null;
  streetName: string | null;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  /** Linha completa para compatibilidade */
  address: string | null;
};

export type CepLookupResult = {
  zipCode: string;
  streetType: string | null;
  streetName: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  /** Logradouro bruto (tipo + nome) */
  address: string | null;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function toAddressParts(parts: {
  streetType?: string | null;
  streetName?: string | null;
  streetNumber?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
}): AddressParts {
  return parts;
}

async function lookupCnpjBrasilApi(cnpj: string): Promise<CnpjLookupResult | null> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { Accept: "application/json", "User-Agent": "MAX-Origem/1.0" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    razao_social?: string;
    nome_fantasia?: string;
    ddd_telefone_1?: string;
    email?: string;
    cep?: string;
    descricao_tipo_de_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
  };

  const phone =
    data.ddd_telefone_1 && data.ddd_telefone_1 !== "0"
      ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}`
      : null;

  const fromTipo = data.descricao_tipo_de_logradouro?.trim() || null;
  const split = splitStreetLine(
    fromTipo
      ? `${fromTipo} ${data.logradouro || ""}`.trim()
      : data.logradouro || null,
  );

  const parts = toAddressParts({
    streetType: split.streetType,
    streetName: split.streetName,
    streetNumber: data.numero || null,
    complement: data.complemento || null,
    neighborhood: data.bairro || null,
  });

  return {
    cnpj,
    name: data.razao_social || "",
    tradeName: data.nome_fantasia || null,
    phone,
    email: data.email || null,
    streetType: parts.streetType || null,
    streetName: parts.streetName || null,
    streetNumber: parts.streetNumber || null,
    complement: parts.complement || null,
    neighborhood: parts.neighborhood || null,
    city: data.municipio || null,
    state: data.uf || null,
    zipCode: data.cep ? digitsOnly(data.cep) : null,
    address: formatFullAddress({
      ...parts,
      city: data.municipio,
      state: data.uf,
    }),
  };
}

async function lookupCnpjWs(cnpj: string): Promise<CnpjLookupResult | null> {
  const res = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
    headers: { Accept: "application/json", "User-Agent": "MAX-Origem/1.0" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    razao_social?: string;
    estabelecimento?: {
      nome_fantasia?: string | null;
      email?: string | null;
      ddd1?: string | null;
      telefone1?: string | null;
      cep?: string | null;
      logradouro?: string | null;
      numero?: string | null;
      complemento?: string | null;
      bairro?: string | null;
      cidade?: { nome?: string | null };
      estado?: { sigla?: string | null };
      tipo_logradouro?: string | null;
    };
  };

  const est = data.estabelecimento;
  const split = splitStreetLine(
    [est?.tipo_logradouro, est?.logradouro].filter(Boolean).join(" ") || null,
  );
  const phone =
    est?.ddd1 && est?.telefone1
      ? `(${est.ddd1}) ${est.telefone1}`
      : null;

  const parts = toAddressParts({
    streetType: split.streetType,
    streetName: split.streetName,
    streetNumber: est?.numero || null,
    complement: est?.complemento || null,
    neighborhood: est?.bairro || null,
  });

  return {
    cnpj,
    name: data.razao_social || "",
    tradeName: est?.nome_fantasia || null,
    phone,
    email: est?.email || null,
    streetType: parts.streetType || null,
    streetName: parts.streetName || null,
    streetNumber: parts.streetNumber || null,
    complement: parts.complement || null,
    neighborhood: parts.neighborhood || null,
    city: est?.cidade?.nome || null,
    state: est?.estado?.sigla || null,
    zipCode: est?.cep ? digitsOnly(est.cep) : null,
    address: formatFullAddress({
      ...parts,
      city: est?.cidade?.nome,
      state: est?.estado?.sigla,
    }),
  };
}

export async function lookupCnpj(
  cnpjInput: string,
): Promise<CnpjLookupResult | null> {
  const cnpj = normalizeCgccpf(cnpjInput);
  if (cnpj.length !== 14) return null;

  try {
    const fromWs = await lookupCnpjWs(cnpj);
    if (fromWs?.name) return fromWs;

    const fromBrasil = await lookupCnpjBrasilApi(cnpj);
    if (fromBrasil?.name) return fromBrasil;

    return fromWs || fromBrasil;
  } catch (error) {
    console.error("CNPJ lookup failed:", error);
    return null;
  }
}

export async function lookupCep(
  cepInput: string,
): Promise<CepLookupResult | null> {
  const zipCode = digitsOnly(cepInput);
  if (zipCode.length !== 8) return null;

  try {
    const via = await fetch(`https://viacep.com.br/ws/${zipCode}/json/`, {
      headers: { Accept: "application/json", "User-Agent": "MAX-Origem/1.0" },
      next: { revalidate: 86400 },
    });
    if (via.ok) {
      const data = (await via.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (!data.erro) {
        const split = splitStreetLine(data.logradouro || null);
        return {
          zipCode,
          streetType: split.streetType,
          streetName: split.streetName,
          address: data.logradouro || null,
          neighborhood: data.bairro || null,
          city: data.localidade || null,
          state: data.uf || null,
        };
      }
    }

    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${zipCode}`, {
      headers: { Accept: "application/json", "User-Agent": "MAX-Origem/1.0" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      street?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
    };
    const split = splitStreetLine(data.street || null);
    return {
      zipCode,
      streetType: split.streetType,
      streetName: split.streetName,
      address: data.street || null,
      neighborhood: data.neighborhood || null,
      city: data.city || null,
      state: data.state || null,
    };
  } catch (error) {
    console.error("CEP lookup failed:", error);
    return null;
  }
}
