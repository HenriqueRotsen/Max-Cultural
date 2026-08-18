import type { SigaCulturalColumn } from "@/lib/schema";

/** Nomes amigáveis para exibição (sem jargão técnico) */
export const COLUMN_LABELS: Record<SigaCulturalColumn, string> = {
  id_projeto: "ID do projeto",
  id_oficina: "ID da oficina",
  PROPONENTE: "Proponente",
  PRONAC: "PRONAC",
  Nome_projeto: "Nome do projeto",
  Identificacao_ano_projeto: "Ano do projeto",
  Nome_oficina: "Nome da oficina",
  Data_inscricao: "Data da inscrição",
  Nome: "Nome",
  Apelido: "Apelido",
  CPF: "CPF",
  Data_nascimento: "Data de nascimento",
  Genero: "Gênero",
  Etnia: "Etnia / raça",
  "E-mail": "E-mail",
  Telefone: "Telefone",
  Possui_deficiencia: "Possui deficiência",
  RestricaoAlimentar: "Restrição alimentar",
  Ficousabendo: "Como ficou sabendo",
  Lougradouro: "Logradouro",
  Numero: "Número",
  Complemento: "Complemento",
  Bairro: "Bairro",
  CEP: "CEP",
  Cidade: "Cidade",
  Estado: "Estado",
  Redesocial: "Rede social",
  Escolaridade: "Escolaridade",
  idade_atual: "Idade atual",
  idade_inscricao: "Idade na inscrição",
  Territorio: "Território (comunidade)",
  Inscritos: "Inscritos",
  Selecionados: "Selecionados",
  Participantes: "Participantes",
  Certificado: "Certificado",
};

export function columnLabel(col: SigaCulturalColumn | string): string {
  return COLUMN_LABELS[col as SigaCulturalColumn] ?? col;
}
