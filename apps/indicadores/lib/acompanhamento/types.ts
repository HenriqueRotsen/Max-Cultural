import type {
  AreaTarefa,
  FaseTarefa,
  StatusGestao,
  StatusTarefa,
  UnidadeTarefa,
} from "@/lib/acompanhamento/regras";

export type { AreaTarefa, FaseTarefa, StatusGestao, StatusTarefa, UnidadeTarefa };

export const STATUS_LABEL: Record<StatusTarefa, string> = {
  NAO_CONTEMPLADA: "Não contemplada",
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

export const GESTAO_LABEL: Record<StatusGestao, string> = {
  AGUARDANDO_LIBERACAO: "Aguardando liberação",
  NAO_CONTEMPLADA: "Não contemplada",
  CONCLUIDA: "Concluída",
  SEM_PRAZO: "Sem prazo",
  NO_PRAZO: "No prazo",
  PRAZO_PROXIMO: "Prazo próximo",
  EM_ATRASO: "Em atraso",
};

export const FASE_LABEL: Record<FaseTarefa, string> = {
  PLANEJAMENTO: "Planejamento",
  ESTRUTURACAO: "Estruturação",
  FLUXO_CONTINUO: "Fluxo contínuo",
  ENCERRAMENTO: "Encerramento",
  ANTES: "Antes",
  DURANTE: "Durante",
  DEPOIS: "Depois",
};

export const FASES_NIVEL1: FaseTarefa[] = ["PLANEJAMENTO", "ESTRUTURACAO", "FLUXO_CONTINUO", "ENCERRAMENTO"];
export const FASES_NIVEL2: FaseTarefa[] = ["ANTES", "DURANTE", "DEPOIS"];

export const AREA_LABEL: Record<AreaTarefa, string> = {
  COMUNICACAO: "Comunicação",
  PRODUCAO: "Produção",
};

export type TarefaDTO = {
  id: string;
  area: AreaTarefa;
  nivel: number;
  fase: FaseTarefa;
  titulo: string;
  detalhamento: string;
  unidade: UnidadeTarefa;
  acaoId: string | null;
  agendaId: string | null;
  cidade: string | null;
  uf: string | null;
  status: StatusTarefa;
  gestao: StatusGestao;
  /** yyyy-mm-dd */
  prazo: string | null;
  avulsa: boolean;
  comentarios: number;
  escaladasAbertas: number;
};

export type AgendaDTO = {
  id: string;
  acaoId: string;
  titulo: string;
  cidade: string;
  uf: string;
  /** yyyy-mm-dd */
  data: string;
};

export type AcaoAcompDTO = {
  id: string;
  nome: string;
  tipoId: string;
  tipoNome: string;
  agenda: AgendaDTO[];
};

export type AcompanhamentoDTO = {
  projeto: { id: string; nome: string; pronac: string; proponente: string; contextoNome: string };
  inicioExecucao: string | null;
  fimExecucao: string | null;
  recursoLiberadoEm: string | null;
  financeiroVinculado: boolean;
  acoes: AcaoAcompDTO[];
  tarefas: TarefaDTO[];
  pode: { comunicacao: boolean; producao: boolean; gestao: boolean };
};

export type ComentarioDTO = {
  id: string;
  autorNome: string;
  texto: string;
  escalada: boolean;
  resolvida: boolean;
  /** ISO */
  criadoEm: string;
};

export type ProjetoAcompResumoDTO = {
  id: string;
  nome: string;
  pronac: string;
  contextoNome: string;
  acoes: number;
  recursoLiberado: boolean;
  comunicacao: { pct: number; total: number };
  producao: { pct: number; total: number };
  pedemAtencao: number;
};
