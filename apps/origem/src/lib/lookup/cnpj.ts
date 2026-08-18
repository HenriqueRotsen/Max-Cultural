/** Consulta pública BrasilAPI CNPJ — https://brasilapi.com.br/docs#tag/CNPJ */

export type CnpjQsaMember = {
  name: string;
  /** CPF/CNPJ mascarado ou vazio — BrasilAPI raramente traz documento completo */
  cgccpf: string;
  personType: "PF" | "PJ";
  qualification: string;
  role: "PARTNER" | "ADMINISTRATOR" | "BOTH";
};

export type CnpjCompanyResult = {
  cnpj: string;
  name: string;
  tradeName: string | null;
  email: string | null;
  phone: string | null;
  personType: "PJ" | "MEI";
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  /** Data de abertura / início da atividade */
  foundedAt: Date | null;
  qsa: CnpjQsaMember[];
};

function formatPhone(dddTelefone: string | null | undefined): string | null {
  if (!dddTelefone) return null;
  const digits = dddTelefone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits;
}

function parseBrDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function mapQualification(qual: string): "PARTNER" | "ADMINISTRATOR" | "BOTH" {
  const q = qual
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isAdmin =
    q.includes("administrador") ||
    q.includes("diretor") ||
    q.includes("presidente") ||
    q.includes("gerente");
  const isPartner =
    q.includes("socio") ||
    q.includes("titular") ||
    q.includes("empresario");
  if (isAdmin && isPartner) return "BOTH";
  if (isAdmin) return "ADMINISTRATOR";
  return "PARTNER";
}

export async function fetchCnpjCompany(cnpjRaw: string): Promise<CnpjCompanyResult | null> {
  const cnpj = cnpjRaw.replace(/\D/g, "");
  if (cnpj.length !== 14) return null;

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SalinkAuditor/1.0 (+https://salink.app)",
    },
    next: { revalidate: 86400 },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Consulta CNPJ indisponível (${res.status})`);
  }

  const data = (await res.json()) as {
    cnpj?: string;
    razao_social?: string;
    nome_fantasia?: string;
    email?: string | null;
    ddd_telefone_1?: string | null;
    opcao_pelo_mei?: boolean | string | null;
    cep?: string | null;
    descricao_tipo_de_logradouro?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    data_inicio_atividade?: string | null;
    qsa?: Array<{
      nome_socio?: string;
      cnpj_cpf_do_socio?: string;
      qualificacao_socio?: string;
    }>;
  };

  const tipoLog = (data.descricao_tipo_de_logradouro || "").trim();
  const log = (data.logradouro || "").trim();
  const street = [tipoLog, log].filter(Boolean).join(" ").trim() || null;

  const name =
    (data.razao_social || "").trim() ||
    (data.nome_fantasia || "").trim() ||
    "";
  if (!name) return null;

  const mei =
    data.opcao_pelo_mei === true ||
    data.opcao_pelo_mei === "true" ||
    data.opcao_pelo_mei === "S";

  const qsa: CnpjQsaMember[] = (data.qsa || [])
    .map((row) => {
      const memberName = (row.nome_socio || "").trim();
      if (!memberName) return null;
      const qual = (row.qualificacao_socio || "").trim();
      const rawDoc = (row.cnpj_cpf_do_socio || "").replace(/\D/g, "");
      const personType: "PF" | "PJ" =
        rawDoc.length === 14 ? "PJ" : "PF";
      return {
        name: memberName,
        cgccpf: rawDoc.length === 11 || rawDoc.length === 14 ? rawDoc : "",
        personType,
        qualification: qual,
        role: mapQualification(qual || "socio"),
      };
    })
    .filter((x): x is CnpjQsaMember => Boolean(x));

  return {
    cnpj,
    name,
    tradeName: (data.nome_fantasia || "").trim() || null,
    email: (data.email || "").trim().toLowerCase() || null,
    phone: formatPhone(data.ddd_telefone_1),
    personType: mei ? "MEI" : "PJ",
    zip: data.cep ? data.cep.replace(/\D/g, "") : null,
    street,
    number: (data.numero || "").trim() || null,
    complement: (data.complemento || "").trim() || null,
    neighborhood: (data.bairro || "").trim() || null,
    city: (data.municipio || "").trim() || null,
    state: (data.uf || "").trim().toUpperCase() || null,
    foundedAt: parseBrDate(data.data_inicio_atividade),
    qsa,
  };
}
