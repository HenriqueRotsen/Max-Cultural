export type ScreenAction = "view" | "edit";

export const SCREENS = [
  { id: "cultural.home", label: "Início", group: "Cultural" },
  { id: "cultural.usuarios", label: "Usuários", group: "Cultural" },
  { id: "cultural.papeis", label: "Papéis", group: "Cultural" },
  { id: "cultural.logs", label: "Logs", group: "Cultural" },
  { id: "origem.app", label: "MAX Origem", group: "Produtos" },
  { id: "origem.auditoria", label: "Auditoria", group: "Origem" },
  { id: "origem.fornecedores", label: "Fornecedores", group: "Origem" },
  { id: "fluxo.app", label: "MAX Fluxo", group: "Produtos" },
  { id: "fluxo.operacao", label: "Operação", group: "Fluxo" },
  { id: "fluxo.consultas", label: "Consultas", group: "Fluxo" },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];

export const SCREEN_IDS = SCREENS.map((s) => s.id);
