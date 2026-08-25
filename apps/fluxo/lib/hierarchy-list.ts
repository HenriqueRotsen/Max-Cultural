export const HIERARQUIA_PAGE_SIZE = 25;
export const HIERARQUIA_SELECT_LIMIT = 200;

export type ContextoSelectOption = { id: string; nome: string };

export type ProjetoSelectOption = {
  id: string;
  nome: string;
  pronac: string;
  contextoId: string;
};

export type OficinaSelectOption = {
  id: string;
  nome: string;
  projetoId: string;
  projetoNome: string;
  contextoId: string;
  contextoNome: string;
  pronac: string;
  proponente: string;
  ano: string;
};
