import type {
  AreaTarefa,
  FaseTarefa,
  PrazoBase,
  StatusGestao,
  StatusTarefa,
  UnidadeTarefa,
} from "@/lib/acompanhamento/regras";

export type { AreaTarefa, FaseTarefa, PrazoBase, StatusGestao, StatusTarefa, UnidadeTarefa };

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

export const BASE_LABEL: Record<PrazoBase, string> = {
  INICIO_EXECUCAO: "início da execução",
  FIM_EXECUCAO: "fim da execução",
  INICIO_ACAO: "início da ação",
  FIM_ACAO: "fim da ação",
};

/** Notação D: "D+15 · início da execução", "D−3 · início da ação", "sem prazo". */
export function regraLabel(base: PrazoBase | null, dias: number | null): string {
  if (!base || dias == null) return "sem prazo";
  return `${notacaoD(dias)} · ${BASE_LABEL[base]}`;
}

export function notacaoD(dias: number): string {
  return `D${dias < 0 ? "−" : "+"}${Math.abs(dias)}`;
}

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
  /** Dia em que foi concluída (yyyy-mm-dd, Brasília); só para concluídas. */
  concluidaEm: string | null;
  /** Conclusão × prazo: >0 depois, <0 antes, 0 no dia. */
  diasAposPrazo: number | null;
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
  /** Início da realização (yyyy-mm-dd). */
  data: string;
  /** Fim da realização (yyyy-mm-dd); nulo = um dia só. */
  dataFim: string | null;
  territorioId: string | null;
  online: boolean;
  /** "Buritis, Belo Horizonte, MG" ou "Online". */
  local: string;
};

/** "Buritis, Belo Horizonte, MG" (zona opcional). */
export function territorioLabel(t: { nome: string; cidade: string; estado: string }): string {
  return [t.nome, t.cidade, t.estado].map((x) => x.trim()).filter(Boolean).join(", ");
}

export type AcaoAcompDTO = {
  id: string;
  nome: string;
  tipoId: string;
  tipoNome: string;
  ofereceOnline: boolean;
  oferecePresencial: boolean;
  territorios: Array<{ id: string; label: string }>;
  agenda: AgendaDTO[];
};

export type AcompanhamentoDTO = {
  projeto: { id: string; nome: string; pronac: string; proponente: string; contextoNome: string };
  inicioExecucao: string | null;
  fimExecucao: string | null;
  recursoLiberadoEm: string | null;
  /** De onde veio a liberação: detectada no Financeiro ou informada pela gestão. */
  recursoFonte: "FINANCEIRO" | "GESTAO" | null;
  financeiroVinculado: boolean;
  /** Projeto do MAX Financeiro ligado a este (PRONAC ou escolhido pela gestão). */
  financeiro: FinanceiroResumoDTO | null;
  /** Vínculo escolhido pela gestão (não segue o PRONAC). */
  financeiroManual: boolean;
  /** Dia em que o projeto guardou a pré-definição (yyyy-mm-dd). */
  preDefinicaoEm: string | null;
  /** Tarefas da pré-definição guardada no projeto, com o prazo deste projeto e o da pré-definição geral. */
  prazos: PrazoProjetoDTO[];
  acoes: AcaoAcompDTO[];
  tarefas: TarefaDTO[];
  pode: { comunicacao: boolean; producao: boolean; gestao: boolean };
};

export type PrazoProjetoDTO = {
  modeloId: string;
  area: AreaTarefa;
  nivel: number;
  fase: FaseTarefa;
  titulo: string;
  unidade: UnidadeTarefa;
  /** Nomes dos tipos de ação a que se aplica (vazio = todos). */
  tiposNomes: string[];
  ordem: number;
  prazoBase: PrazoBase | null;
  prazoDias: number | null;
  /** Prazo na pré-definição geral (null = a tarefa não está mais nela). */
  padrao: { prazoBase: PrazoBase | null; prazoDias: number | null } | null;
  /** Tarefas deste projeto com o prazo mudado à mão (não seguem a regra). */
  editadasAMao: number;
};

export type FinanceiroResumoDTO = {
  id: string;
  nome: string;
  /** "Federal · PRONAC 240001" ou "MG · código 2024-015". */
  label: string;
  captadoTransferido: number | null;
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
  recursoFonte: "FINANCEIRO" | "GESTAO" | null;
  comunicacao: { pct: number; total: number };
  producao: { pct: number; total: number };
  /** Tarefas não concluídas com o prazo já vencido. */
  emAtraso: number;
  /** Tarefas não concluídas que vencem nos próximos 3 dias. */
  vencendo: number;
  /** emAtraso + vencendo. */
  pedemAtencao: number;
};

export type FiltroRecurso = "todos" | "liberado" | "aguardando";
export type OrdemLista = "nome" | "atencao";

export type ListaAcompanhamentoParams = {
  q?: string;
  contextoId?: string;
  recurso?: FiltroRecurso;
  /** Só projetos com tarefas atrasadas ou vencendo em até 3 dias. */
  atencao?: boolean;
  ordem?: OrdemLista;
  page?: number;
};

export type ListaAcompanhamentoDTO = {
  items: ProjetoAcompResumoDTO[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  contextos: Array<{ id: string; nome: string }>;
};

/** Tarefa da pré-definição (tela de edição). */
export type ModeloDTO = {
  id: string;
  area: AreaTarefa;
  nivel: number;
  fase: FaseTarefa;
  titulo: string;
  detalhamento: string;
  unidade: UnidadeTarefa;
  prazoBase: PrazoBase | null;
  prazoDias: number | null;
  tiposAcao: string[];
  ordem: number;
  ativo: boolean;
};
