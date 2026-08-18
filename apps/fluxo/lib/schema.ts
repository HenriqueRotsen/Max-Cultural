import { z } from "zod";

export const SIGACULTURAL_COLUMNS = [
  "id_projeto",
  "id_oficina",
  "PROPONENTE",
  "PRONAC",
  "Nome_projeto",
  "Identificacao_ano_projeto",
  "Nome_oficina",
  "Data_inscricao",
  "Nome",
  "Apelido",
  "CPF",
  "Data_nascimento",
  "Genero",
  "Etnia",
  "E-mail",
  "Telefone",
  "Possui_deficiencia",
  "RestricaoAlimentar",
  "Ficousabendo",
  "Lougradouro",
  "Numero",
  "Complemento",
  "Bairro",
  "CEP",
  "Cidade",
  "Estado",
  "Redesocial",
  "Escolaridade",
  "idade_atual",
  "idade_inscricao",
  "Territorio",
  "Inscritos",
  "Selecionados",
  "Participantes",
  "Certificado",
] as const;

export type SigaCulturalColumn = (typeof SIGACULTURAL_COLUMNS)[number];

export const GENEROS = [
  "Masculino",
  "Feminino",
  "Não-binário",
  "Outro",
  "Prefiro não informar",
] as const;

export const ETNIAS = [
  "Branca",
  "Preta",
  "Parda",
  "Amarela",
  "Indígena",
  "Prefiro não informar",
] as const;

export const SIM_NAO = ["Sim", "Não"] as const;

export type Genero = (typeof GENEROS)[number];
export type Etnia = (typeof ETNIAS)[number];

export type SigaCulturalRow = {
  id_projeto: string;
  id_oficina: string;
  PROPONENTE: string;
  PRONAC: string;
  Nome_projeto: string;
  Identificacao_ano_projeto: string;
  Nome_oficina: string;
  Data_inscricao: string;
  Nome: string;
  Apelido: string;
  CPF: string;
  Data_nascimento: string;
  Genero: string;
  Etnia: string;
  "E-mail": string;
  Telefone: string;
  Possui_deficiencia: string;
  RestricaoAlimentar: string;
  Ficousabendo: string;
  Lougradouro: string;
  Numero: string;
  Complemento: string;
  Bairro: string;
  CEP: string;
  Cidade: string;
  Estado: string;
  Redesocial: string;
  Escolaridade: string;
  idade_atual: number | null;
  idade_inscricao: number | null;
  Territorio: string;
  Inscritos: number;
  Selecionados: number;
  Participantes: number;
  Certificado: number;
};

export type BatchContext = {
  contextoId?: string;
  Nome_contexto?: string;
  id_projeto: string;
  id_oficina: string;
  PROPONENTE: string;
  PRONAC: string;
  Nome_projeto: string;
  Identificacao_ano_projeto: string;
  Nome_oficina?: string;
};

const emptyToString = z.preprocess(
  (v) => (v === null || v === undefined ? "" : String(v)),
  z.string(),
);

const intFlag = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim().toLowerCase();
  if (["1", "sim", "s", "true", "yes"].includes(s)) return 1;
  if (["0", "nao", "não", "n", "false", "no"].includes(s)) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? (n ? 1 : 0) : 0;
}, z.union([z.literal(0), z.literal(1)]));

const optionalInt = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}, z.number().int().nullable());

export const SigaCulturalRowSchema = z.object({
  id_projeto: emptyToString,
  id_oficina: emptyToString,
  PROPONENTE: emptyToString,
  PRONAC: emptyToString,
  Nome_projeto: emptyToString,
  Identificacao_ano_projeto: emptyToString,
  Nome_oficina: emptyToString,
  Data_inscricao: emptyToString,
  Nome: emptyToString,
  Apelido: emptyToString,
  CPF: emptyToString,
  Data_nascimento: emptyToString,
  Genero: emptyToString,
  Etnia: emptyToString,
  "E-mail": emptyToString,
  Telefone: emptyToString,
  Possui_deficiencia: emptyToString,
  RestricaoAlimentar: emptyToString,
  Ficousabendo: emptyToString,
  Lougradouro: emptyToString,
  Numero: emptyToString,
  Complemento: emptyToString,
  Bairro: emptyToString,
  CEP: emptyToString,
  Cidade: emptyToString,
  Estado: emptyToString,
  Redesocial: emptyToString,
  Escolaridade: emptyToString,
  idade_atual: optionalInt,
  idade_inscricao: optionalInt,
  Territorio: emptyToString,
  Inscritos: z.preprocess((v) => {
    if (v === null || v === undefined || v === "") return 1;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 1;
  }, z.number().int()),
  Selecionados: intFlag,
  Participantes: intFlag,
  Certificado: intFlag,
});

export function emptySigaCulturalRow(
  context: Partial<BatchContext> = {},
): SigaCulturalRow {
  return {
    id_projeto: context.id_projeto ?? "",
    id_oficina: context.id_oficina ?? "",
    PROPONENTE: context.PROPONENTE ?? "",
    PRONAC: context.PRONAC ?? "",
    Nome_projeto: context.Nome_projeto ?? "",
    Identificacao_ano_projeto: context.Identificacao_ano_projeto ?? "",
    Nome_oficina: context.Nome_oficina ?? "",
    Data_inscricao: "",
    Nome: "",
    Apelido: "",
    CPF: "",
    Data_nascimento: "",
    Genero: "",
    Etnia: "",
    "E-mail": "",
    Telefone: "",
    Possui_deficiencia: "Não",
    RestricaoAlimentar: "Não",
    Ficousabendo: "",
    Lougradouro: "",
    Numero: "",
    Complemento: "",
    Bairro: "",
    CEP: "",
    Cidade: "",
    Estado: "",
    Redesocial: "",
    Escolaridade: "",
    idade_atual: null,
    idade_inscricao: null,
    Territorio: "",
    Inscritos: 1,
    Selecionados: 0,
    Participantes: 0,
    Certificado: 0,
  };
}

export type PrismaInscricaoInput = {
  contextoId?: string | null;
  nomeContexto?: string;
  idProjeto: string;
  idOficina: string;
  proponente: string;
  pronac: string;
  nomeProjeto: string;
  identificacaoAnoProjeto: string;
  nomeOficina: string;
  dataInscricao: string;
  nome: string;
  apelido: string;
  cpf: string;
  dataNascimento: string;
  genero: string;
  etnia: string;
  email: string;
  telefone: string;
  possuiDeficiencia: string;
  restricaoAlimentar: string;
  ficouSabendo: string;
  lougradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  cidade: string;
  estado: string;
  redesocial: string;
  escolaridade: string;
  idadeAtual: number | null;
  idadeInscricao: number | null;
  territorio: string;
  inscritos: number;
  selecionados: number;
  participantes: number;
  certificado: number;
};

export function rowToPrisma(
  row: SigaCulturalRow,
  extra?: { contextoId?: string; nomeContexto?: string },
): PrismaInscricaoInput {
  return {
    contextoId: extra?.contextoId ?? null,
    nomeContexto: extra?.nomeContexto ?? "",
    idProjeto: row.id_projeto,
    idOficina: row.id_oficina,
    proponente: row.PROPONENTE,
    pronac: row.PRONAC,
    nomeProjeto: row.Nome_projeto,
    identificacaoAnoProjeto: row.Identificacao_ano_projeto,
    nomeOficina: row.Nome_oficina,
    dataInscricao: row.Data_inscricao,
    nome: row.Nome,
    apelido: row.Apelido,
    cpf: row.CPF,
    dataNascimento: row.Data_nascimento,
    genero: row.Genero,
    etnia: row.Etnia,
    email: row["E-mail"],
    telefone: row.Telefone,
    possuiDeficiencia: row.Possui_deficiencia,
    restricaoAlimentar: row.RestricaoAlimentar,
    ficouSabendo: row.Ficousabendo,
    lougradouro: row.Lougradouro,
    numero: row.Numero,
    complemento: row.Complemento,
    bairro: row.Bairro,
    cep: row.CEP,
    cidade: row.Cidade,
    estado: row.Estado,
    redesocial: row.Redesocial,
    escolaridade: row.Escolaridade,
    idadeAtual: row.idade_atual,
    idadeInscricao: row.idade_inscricao,
    territorio: row.Territorio,
    inscritos: row.Inscritos,
    selecionados: row.Selecionados,
    participantes: row.Participantes,
    certificado: row.Certificado,
  };
}

export function prismaToRow(record: {
  idProjeto: string;
  idOficina: string;
  proponente: string;
  pronac: string;
  nomeProjeto: string;
  identificacaoAnoProjeto: string;
  nomeOficina: string;
  dataInscricao: string;
  nome: string;
  apelido: string;
  cpf: string;
  dataNascimento: string;
  genero: string;
  etnia: string;
  email: string;
  telefone: string;
  possuiDeficiencia: string;
  restricaoAlimentar: string;
  ficouSabendo: string;
  lougradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  cidade: string;
  estado: string;
  redesocial: string;
  escolaridade: string;
  idadeAtual: number | null;
  idadeInscricao: number | null;
  territorio: string;
  inscritos: number;
  selecionados: number;
  participantes: number;
  certificado: number;
}): SigaCulturalRow {
  return {
    id_projeto: record.idProjeto,
    id_oficina: record.idOficina,
    PROPONENTE: record.proponente,
    PRONAC: record.pronac,
    Nome_projeto: record.nomeProjeto,
    Identificacao_ano_projeto: record.identificacaoAnoProjeto,
    Nome_oficina: record.nomeOficina,
    Data_inscricao: record.dataInscricao,
    Nome: record.nome,
    Apelido: record.apelido,
    CPF: record.cpf,
    Data_nascimento: record.dataNascimento,
    Genero: record.genero,
    Etnia: record.etnia,
    "E-mail": record.email,
    Telefone: record.telefone,
    Possui_deficiencia: record.possuiDeficiencia,
    RestricaoAlimentar: record.restricaoAlimentar,
    Ficousabendo: record.ficouSabendo,
    Lougradouro: record.lougradouro,
    Numero: record.numero,
    Complemento: record.complemento,
    Bairro: record.bairro,
    CEP: record.cep,
    Cidade: record.cidade,
    Estado: record.estado,
    Redesocial: record.redesocial,
    Escolaridade: record.escolaridade,
    idade_atual: record.idadeAtual,
    idade_inscricao: record.idadeInscricao,
    Territorio: record.territorio,
    Inscritos: record.inscritos,
    Selecionados: record.selecionados,
    Participantes: record.participantes,
    Certificado: record.certificado,
  };
}

export function rowToExportObject(row: SigaCulturalRow): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const col of SIGACULTURAL_COLUMNS) {
    out[col] = row[col];
  }
  return out;
}
