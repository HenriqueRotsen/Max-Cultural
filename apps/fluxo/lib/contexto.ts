import type { BatchContext } from "@/lib/schema";

export type ContextoDTO = {
  id: string;
  nome: string;
  projetosCount: number;
  inscricoesCount: number;
  /** Escopo "Editar" neste item (independente da permissão de tela). */
  hasEditorAccess: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjetoDTO = {
  id: string;
  nome: string;
  pronac: string;
  proponente: string;
  ano: string;
  contextoId: string;
  contextoNome: string;
  oficinasCount: number;
  inscricoesCount: number;
  hasEditorAccess: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OficinaDTO = {
  id: string;
  nome: string;
  projetoId: string;
  projetoNome: string;
  contextoId: string;
  contextoNome: string;
  pronac: string;
  proponente: string;
  ano: string;
  inscricoesCount: number;
  hasEditorAccess: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ContextoInput = {
  nome: string;
};

export type ProjetoInput = {
  contextoId: string;
  nome: string;
  pronac: string;
  proponente?: string;
  ano?: string;
};

export type OficinaInput = {
  projetoId: string;
  nome: string;
};

/** Snapshot completo para carimbar importação */
export type HierarquiaBatch = BatchContext & {
  contextoId: string;
  Nome_contexto: string;
};

export function oficinaToBatch(o: OficinaDTO): HierarquiaBatch {
  return {
    contextoId: o.contextoId,
    Nome_contexto: o.contextoNome,
    id_projeto: o.projetoId,
    id_oficina: o.id,
    PROPONENTE: o.proponente,
    PRONAC: o.pronac,
    Nome_projeto: o.projetoNome,
    Identificacao_ano_projeto: o.ano,
    Nome_oficina: o.nome,
  };
}
