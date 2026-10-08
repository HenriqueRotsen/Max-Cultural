export const FORMULARIO_CAMPO_TIPOS = [
  "SECTION",
  "SHORT_TEXT",
  "LONG_TEXT",
  "MULTIPLE_CHOICE",
  "CHECKBOXES",
  "DROPDOWN",
  "FILE_UPLOAD",
  "DATE",
  "EMAIL",
  "CPF",
  "PHONE_BR",
  "NAME",
  "BIRTHDATE",
  "GENERO",
  "ETNIA",
  "SIM_NAO_DETALHE",
  "ADDRESS_BR",
  "DECLARACAO",
  "PARTICIPACAO",
  "TERRITORIO_OFICINA",
] as const;

export type FormularioCampoTipoCode = (typeof FORMULARIO_CAMPO_TIPOS)[number];

export type FormularioCampoDraft = {
  id?: string;
  ordem: number;
  rotulo: string;
  descricao: string;
  obrigatorio: boolean;
  tipo: FormularioCampoTipoCode;
  sigaColumn: string | null;
  opcoes: string[] | null;
  config: Record<string, unknown> | null;
};

export type AddressBrValue = {
  CEP: string;
  Lougradouro: string;
  Numero: string;
  Complemento: string;
  Bairro: string;
  Cidade: string;
  Estado: string;
};

export const EMPTY_ADDRESS_BR: AddressBrValue = {
  CEP: "",
  Lougradouro: "",
  Numero: "",
  Complemento: "",
  Bairro: "",
  Cidade: "",
  Estado: "",
};

export const FORMULARIO_CAMPO_TIPO_LABELS: Record<FormularioCampoTipoCode, string> = {
  SECTION: "Seção / título",
  SHORT_TEXT: "Texto curto",
  LONG_TEXT: "Parágrafo",
  MULTIPLE_CHOICE: "Múltipla escolha",
  CHECKBOXES: "Caixas de seleção",
  DROPDOWN: "Lista suspensa",
  FILE_UPLOAD: "Anexo de arquivo",
  DATE: "Data",
  EMAIL: "E-mail",
  CPF: "CPF",
  PHONE_BR: "Telefone (BR)",
  NAME: "Nome completo / social",
  BIRTHDATE: "Data de nascimento",
  GENERO: "Gênero",
  ETNIA: "Etnia / raça",
  SIM_NAO_DETALHE: "Sim/Não com detalhe",
  ADDRESS_BR: "Endereço (CEP)",
  DECLARACAO: "Declaração",
  PARTICIPACAO: "Participação (avaliação)",
  TERRITORIO_OFICINA: "Território da oficina",
};

export function slugifyTitulo(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "formulario"}-${suffix}`;
}
