"use server";

import { prisma } from "@/lib/prisma";
import { normalizeCpf, formatCpfDisplay } from "@/lib/normalize";
import { formatCellDisplay } from "@/lib/validate";
import { prismaToRow } from "@/lib/schema";
import type { SigaCulturalRow } from "@/lib/schema";
import { requirePermission } from "@/lib/auth";
import { andScope, resolveDataScope } from "@/lib/data-scope";
import { writeAuditLog } from "@/lib/audit";

export type PessoaInscricaoResumo = {
  id: string;
  id_projeto: string;
  Nome_projeto: string;
  id_oficina: string;
  Nome_oficina: string;
  PROPONENTE: string;
  PRONAC: string;
  Identificacao_ano_projeto: string;
  Data_inscricao: string;
  Territorio: string;
  Cidade: string;
  Estado: string;
  Selecionados: number;
  Participantes: number;
  Certificado: number;
};

export type PessoaAnalise = {
  totalInscricoes: number;
  projetosUnicos: number;
  oficinasUnicas: number;
  vezesSelecionado: number;
  vezesParticipante: number;
  vezesCertificado: number;
  taxaSelecao: number;
  taxaParticipacao: number;
  taxaCertificado: number;
  funil: {
    inscritos: number;
    selecionados: number;
    participantes: number;
    certificados: number;
  };
  porProjeto: Array<{
    id_projeto: string;
    Nome_projeto: string;
    inscricoes: number;
    selecionados: number;
    participantes: number;
    certificados: number;
  }>;
  porAno: Array<{
    ano: string;
    inscricoes: number;
    selecionados: number;
    participantes: number;
    certificados: number;
  }>;
  porStatus: Array<{ label: string; value: number; tone: string }>;
};

export type PessoaPerfil = {
  cpf: string;
  cpfDisplay: string;
  nome: string;
  apelido: string;
  email: string;
  telefone: string;
  telefoneDisplay: string;
  dataNascimento: string;
  genero: string;
  etnia: string;
  escolaridade: string;
  cidade: string;
  estado: string;
  territorio: string;
  possuiDeficiencia: string;
  restricaoAlimentar: string;
  redesocial: string;
  idadeAtual: number | null;
  inscricoes: PessoaInscricaoResumo[];
  analise: PessoaAnalise;
};

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function pickProfile(rows: SigaCulturalRow[]): Partial<SigaCulturalRow> {
  const sorted = [...rows].sort((a, b) => {
    const da = a.Data_inscricao || "";
    const db = b.Data_inscricao || "";
    return db.localeCompare(da);
  });
  const profile: Record<string, unknown> = {};
  const keys: (keyof SigaCulturalRow)[] = [
    "Nome",
    "Apelido",
    "E-mail",
    "Telefone",
    "Data_nascimento",
    "Genero",
    "Etnia",
    "Escolaridade",
    "Cidade",
    "Estado",
    "Territorio",
    "Possui_deficiencia",
    "RestricaoAlimentar",
    "Redesocial",
    "Lougradouro",
    "Numero",
    "Complemento",
    "Bairro",
    "CEP",
    "idade_atual",
  ];
  for (const row of sorted) {
    for (const key of keys) {
      const cur = profile[key];
      const next = row[key];
      const empty =
        cur === undefined ||
        cur === null ||
        cur === "" ||
        (typeof cur === "number" && Number.isNaN(cur));
      if (empty && next !== undefined && next !== null && next !== "") {
        profile[key] = next;
      }
    }
  }
  return profile as Partial<SigaCulturalRow>;
}

function buildAnalise(inscricoes: PessoaInscricaoResumo[]): PessoaAnalise {
  const totalInscricoes = inscricoes.length;
  const vezesSelecionado = inscricoes.filter((i) => i.Selecionados === 1).length;
  const vezesParticipante = inscricoes.filter((i) => i.Participantes === 1).length;
  const vezesCertificado = inscricoes.filter((i) => i.Certificado === 1).length;

  const projetos = new Map<
    string,
    {
      id_projeto: string;
      Nome_projeto: string;
      inscricoes: number;
      selecionados: number;
      participantes: number;
      certificados: number;
    }
  >();
  const anos = new Map<
    string,
    {
      ano: string;
      inscricoes: number;
      selecionados: number;
      participantes: number;
      certificados: number;
    }
  >();

  for (const row of inscricoes) {
    const pKey = row.id_projeto || row.Nome_projeto;
    const p = projetos.get(pKey) ?? {
      id_projeto: row.id_projeto,
      Nome_projeto: row.Nome_projeto || row.id_projeto || "Projeto",
      inscricoes: 0,
      selecionados: 0,
      participantes: 0,
      certificados: 0,
    };
    p.inscricoes += 1;
    p.selecionados += row.Selecionados === 1 ? 1 : 0;
    p.participantes += row.Participantes === 1 ? 1 : 0;
    p.certificados += row.Certificado === 1 ? 1 : 0;
    projetos.set(pKey, p);

    const ano = row.Identificacao_ano_projeto?.trim() || "Sem ano";
    const a = anos.get(ano) ?? {
      ano,
      inscricoes: 0,
      selecionados: 0,
      participantes: 0,
      certificados: 0,
    };
    a.inscricoes += 1;
    a.selecionados += row.Selecionados === 1 ? 1 : 0;
    a.participantes += row.Participantes === 1 ? 1 : 0;
    a.certificados += row.Certificado === 1 ? 1 : 0;
    anos.set(ano, a);
  }

  return {
    totalInscricoes,
    projetosUnicos: projetos.size,
    oficinasUnicas: new Set(inscricoes.map((i) => i.id_oficina)).size,
    vezesSelecionado,
    vezesParticipante,
    vezesCertificado,
    taxaSelecao: pct(vezesSelecionado, totalInscricoes),
    taxaParticipacao: pct(vezesParticipante, vezesSelecionado || totalInscricoes),
    taxaCertificado: pct(
      vezesCertificado,
      vezesParticipante || vezesSelecionado || totalInscricoes,
    ),
    funil: {
      inscritos: totalInscricoes,
      selecionados: vezesSelecionado,
      participantes: vezesParticipante,
      certificados: vezesCertificado,
    },
    porProjeto: [...projetos.values()].sort((a, b) => b.inscricoes - a.inscricoes),
    porAno: [...anos.values()].sort((a, b) => a.ano.localeCompare(b.ano)),
    porStatus: [
      {
        label: "Inscrito",
        value: totalInscricoes,
        tone: "emerald",
      },
      {
        label: "Selecionado",
        value: vezesSelecionado,
        tone: "sky",
      },
      {
        label: "Participante",
        value: vezesParticipante,
        tone: "teal",
      },
      {
        label: "Certificado",
        value: vezesCertificado,
        tone: "amber",
      },
    ],
  };
}

export async function getPessoaByCpfAction(
  cpfRaw: string,
): Promise<{ ok: true; pessoa: PessoaPerfil } | { ok: false; error: string }> {
  const user = await requirePermission("consultas:cpf");
  const cpf = normalizeCpf(cpfRaw);
  if (cpf.length !== 11) {
    return { ok: false, error: "CPF inválido. Use 11 dígitos." };
  }

  const scope = await resolveDataScope(user.id);
  const records = await prisma.inscricao.findMany({
    where: andScope(scope, { cpf }),
    orderBy: [{ dataInscricao: "desc" }, { createdAt: "desc" }],
  });

  if (records.length === 0) {
    const any = await prisma.inscricao.count({ where: { cpf } });
    if (any > 0) {
      return {
        ok: false,
        error:
          "Este CPF existe na base, mas fora do seu acesso (contextos/projetos/oficinas).",
      };
    }
    return { ok: false, error: "Nenhuma inscrição encontrada para este CPF." };
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "consulta.cpf",
    entityType: "Cpf",
    entityId: cpf,
    meta: { inscricoes: records.length },
  });

  const rows = records.map(prismaToRow);
  const profile = pickProfile(rows);

  const inscricoes: PessoaInscricaoResumo[] = rows.map((row, i) => ({
    id: records[i]!.id,
    id_projeto: row.id_projeto,
    Nome_projeto: row.Nome_projeto,
    id_oficina: row.id_oficina,
    Nome_oficina: row.Nome_oficina,
    PROPONENTE: row.PROPONENTE,
    PRONAC: row.PRONAC,
    Identificacao_ano_projeto: row.Identificacao_ano_projeto,
    Data_inscricao: row.Data_inscricao,
    Territorio: row.Territorio,
    Cidade: row.Cidade,
    Estado: row.Estado,
    Selecionados: row.Selecionados,
    Participantes: row.Participantes,
    Certificado: row.Certificado,
  }));

  const pessoa: PessoaPerfil = {
    cpf,
    cpfDisplay: formatCpfDisplay(cpf) || cpf,
    nome: String(profile.Nome ?? rows[0]!.Nome),
    apelido: String(profile.Apelido ?? ""),
    email: String(profile["E-mail"] ?? ""),
    telefone: String(profile.Telefone ?? ""),
    telefoneDisplay: formatCellDisplay("Telefone", profile.Telefone),
    dataNascimento: formatCellDisplay(
      "Data_nascimento",
      profile.Data_nascimento,
    ),
    genero: String(profile.Genero ?? ""),
    etnia: String(profile.Etnia ?? ""),
    escolaridade: String(profile.Escolaridade ?? ""),
    cidade: String(profile.Cidade ?? ""),
    estado: String(profile.Estado ?? ""),
    territorio: String(profile.Territorio ?? ""),
    possuiDeficiencia: String(profile.Possui_deficiencia ?? ""),
    restricaoAlimentar: String(profile.RestricaoAlimentar ?? ""),
    redesocial: String(profile.Redesocial ?? ""),
    idadeAtual:
      typeof profile.idade_atual === "number" ? profile.idade_atual : null,
    inscricoes,
    analise: buildAnalise(inscricoes),
  };

  return { ok: true, pessoa };
}
