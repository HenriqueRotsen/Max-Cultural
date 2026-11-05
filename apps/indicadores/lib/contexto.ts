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
  acoesCount: number;
  inscricoesCount: number;
  hasEditorAccess: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AcaoTerritorioDTO = {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
  ordem: number;
};

export type AcaoTerritorioInput = {
  id?: string;
  nome?: string;
  cidade: string;
  estado: string;
  ordem?: number;
};

export type AcaoDTO = {
  id: string;
  nome: string;
  projetoId: string;
  projetoNome: string;
  contextoId: string;
  contextoNome: string;
  pronac: string;
  proponente: string;
  ano: string;
  /** Tipo da ação (ex.: "oficina"). */
  tipoId: string;
  tipoNome: string;
  ofereceOnline: boolean;
  oferecePresencial: boolean;
  territorios: AcaoTerritorioDTO[];
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
  pronac?: string;
  proponente?: string;
  ano?: string;
};

export type AcaoTipoDTO = { id: string; nome: string };

export type AcaoInput = {
  projetoId: string;
  nome: string;
  /** Padrão: "oficina". */
  tipoId?: string;
  ofereceOnline?: boolean;
  oferecePresencial?: boolean;
  territorios?: AcaoTerritorioInput[];
};

/** Snapshot completo para carimbar importação */
export type HierarquiaBatch = BatchContext & {
  contextoId: string;
  Nome_contexto: string;
};

export function acaoToBatch(o: AcaoDTO): HierarquiaBatch {
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
    acaoTerritorioCatalog: {
      ofereceOnline: o.ofereceOnline,
      oferecePresencial: o.oferecePresencial,
      territorios: o.territorios.map((t) => ({
        id: t.id,
        nome: t.nome,
        cidade: t.cidade,
        estado: t.estado,
      })),
    },
  };
}
