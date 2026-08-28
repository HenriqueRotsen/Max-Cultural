export type ScreenAction = "view" | "edit";

export const SCREENS = [
  { id: "cultural.home", label: "Início", group: "Cultural" },
  { id: "cultural.projetos", label: "Projetos", group: "Cultural" },
  { id: "cultural.usuarios", label: "Usuários", group: "Cultural" },
  { id: "cultural.papeis", label: "Papéis", group: "Cultural" },
  { id: "cultural.logs", label: "Logs", group: "Cultural" },
  { id: "origem.app", label: "MAX Origem", group: "Produtos" },
  { id: "origem.proponentes", label: "Proponentes", group: "Origem" },
  { id: "origem.auditoria", label: "Auditoria", group: "Origem" },
  { id: "origem.fornecedores", label: "Fornecedores", group: "Origem" },
  { id: "origem.planejamento", label: "Planejamento", group: "Origem" },
  {
    id: "origem.planejamento.exceder_rubrica",
    label: "Exceder rubrica (Planejamento)",
    group: "Origem",
  },
  {
    id: "origem.planejamento.subir_salic",
    label: "Enviar projeto ao SALIC (Planejamento)",
    group: "Origem",
  },
  {
    id: "origem.planejamento.readequacao",
    label: "Readequação de planilha (Planejamento)",
    group: "Origem",
  },
  {
    id: "origem.planejamento.excluir_nf",
    label: "Excluir NF/RPA (Planejamento)",
    group: "Origem",
  },
  { id: "fluxo.app", label: "MAX Fluxo", group: "Produtos" },
  { id: "fluxo.operacao", label: "Operação", group: "Fluxo" },
  { id: "fluxo.consultas", label: "Consultas", group: "Fluxo" },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];

export const SCREEN_IDS = SCREENS.map((s) => s.id);
