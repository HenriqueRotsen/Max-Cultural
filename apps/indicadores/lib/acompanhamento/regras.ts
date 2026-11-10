/**
 * Regras do acompanhamento de Comunicação e Produção (sem banco: testáveis).
 *
 * - Prazo = data base + dias do modelo (notação D±N). A data base é o início ou o
 *   fim da execução do projeto (nível 1) ou da realização da ação (nível 2).
 * - Status de gestão é calculado (prazo × status da equipe × hoje), nunca gravado.
 * - Tarefas de um projeto são geradas a partir dos modelos; a geração é
 *   idempotente pela `chaveTarefa` (rodar de novo não duplica).
 */

export type AreaTarefa = "COMUNICACAO" | "PRODUCAO";
export type FaseTarefa =
  | "PLANEJAMENTO"
  | "ESTRUTURACAO"
  | "FLUXO_CONTINUO"
  | "ENCERRAMENTO"
  | "ANTES"
  | "DURANTE"
  | "DEPOIS";
export type UnidadeTarefa = "PROJETO" | "ACAO" | "CIDADE";
export type PrazoBase = "INICIO_EXECUCAO" | "FIM_EXECUCAO" | "INICIO_ACAO" | "FIM_ACAO";
export type StatusTarefa = "NAO_CONTEMPLADA" | "NAO_INICIADA" | "EM_ANDAMENTO" | "CONCLUIDA";

export type StatusGestao =
  | "AGUARDANDO_LIBERACAO"
  | "NAO_CONTEMPLADA"
  | "CONCLUIDA"
  | "SEM_PRAZO"
  | "NO_PRAZO"
  | "PRAZO_PROXIMO"
  | "EM_ATRASO";

/** "Prazo próximo" a partir de quantos dias antes do prazo. */
export const DIAS_PRAZO_PROXIMO = 3;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Meia-noite UTC do dia (prazos são por dia, sem hora). */
export function inicioDoDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function somarDias(d: Date, dias: number): Date {
  return new Date(inicioDoDia(d).getTime() + dias * DIA_MS);
}

/** Dias corridos de `de` até `ate` (negativo se `ate` já passou). */
export function diasEntre(de: Date, ate: Date): number {
  return Math.round((inicioDoDia(ate).getTime() - inicioDoDia(de).getTime()) / DIA_MS);
}

export type ModeloTarefa = {
  id: string;
  area: AreaTarefa;
  nivel: number;
  fase: FaseTarefa;
  titulo: string;
  detalhamento: string;
  unidade: UnidadeTarefa;
  prazoBase: PrazoBase | null;
  prazoDias: number | null;
  /** Ids de tipos de ação; vazio = todos. */
  tiposAcao: string[];
  ordem: number;
  ativo: boolean;
};

export type DatasProjeto = {
  inicioExecucao: Date | null;
  fimExecucao: Date | null;
};

/** Período de execução da realização da ação (ou da cidade). */
export type PeriodoAcao = { inicio: Date; fim: Date };

/** Prazo de uma tarefa: data base + dias. */
export function calcularPrazo(
  modelo: Pick<ModeloTarefa, "prazoBase" | "prazoDias">,
  datas: DatasProjeto,
  acao?: PeriodoAcao | null,
): Date | null {
  if (!modelo.prazoBase || modelo.prazoDias == null) return null;
  const base =
    modelo.prazoBase === "INICIO_EXECUCAO"
      ? datas.inicioExecucao
      : modelo.prazoBase === "FIM_EXECUCAO"
        ? datas.fimExecucao
        : modelo.prazoBase === "INICIO_ACAO"
          ? (acao?.inicio ?? null)
          : (acao?.fim ?? null);
  return base ? somarDias(base, modelo.prazoDias) : null;
}

export function statusGestao(input: {
  status: StatusTarefa;
  prazo: Date | null;
  recursoLiberado: boolean;
  hoje: Date;
}): StatusGestao {
  if (input.status === "NAO_CONTEMPLADA") return "NAO_CONTEMPLADA";
  if (input.status === "CONCLUIDA") return "CONCLUIDA";
  // Antes da liberação do recurso nada pode estar atrasado.
  if (!input.recursoLiberado) return "AGUARDANDO_LIBERACAO";
  if (!input.prazo) return "SEM_PRAZO";
  const faltam = diasEntre(input.hoje, input.prazo);
  if (faltam < 0) return "EM_ATRASO";
  if (faltam <= DIAS_PRAZO_PROXIMO) return "PRAZO_PROXIMO";
  return "NO_PRAZO";
}

/**
 * Dia (no calendário de Brasília) de um instante: a conclusão é gravada com
 * hora; o prazo é um dia. Devolve meia-noite UTC desse dia, como os prazos.
 */
export function diaEmBrasilia(d: Date): Date {
  const [y, m, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y!, m! - 1, dia!));
}

/**
 * Dias entre o prazo e a conclusão: positivo = concluída depois do prazo,
 * negativo = antes, 0 = no dia. Nulo sem prazo ou sem conclusão.
 */
export function diasAposPrazo(prazo: Date | null, concluidaEm: Date | null): number | null {
  if (!prazo || !concluidaEm) return null;
  return diasEntre(prazo, diaEmBrasilia(concluidaEm));
}

/** Precisa de atenção da gestão (em atraso ou prazo próximo). */
export function pedeAtencao(s: StatusGestao): boolean {
  return s === "EM_ATRASO" || s === "PRAZO_PROXIMO";
}

/** % concluído, ignorando as não contempladas. */
export function percentualConcluido(statuses: StatusTarefa[]): number {
  const validas = statuses.filter((s) => s !== "NAO_CONTEMPLADA");
  if (!validas.length) return 0;
  return Math.round((validas.filter((s) => s === "CONCLUIDA").length / validas.length) * 100);
}

export type AcaoParaGerar = {
  id: string;
  tipoId: string;
  /** `data` = início da realização; `dataFim` nulo = um dia só. */
  agenda: Array<{ id: string; cidade: string; uf: string; data: Date; dataFim?: Date | null; online?: boolean }>;
};

export type TarefaGerada = {
  modeloId: string;
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
  prazo: Date | null;
  ordem: number;
};

/** Identifica a tarefa gerada: o mesmo modelo no mesmo alvo nunca se repete. */
export function chaveTarefa(t: {
  modeloId: string | null;
  unidade: UnidadeTarefa;
  acaoId: string | null;
  agendaId: string | null;
  cidade: string | null;
  uf: string | null;
}): string {
  const alvo =
    t.unidade === "PROJETO"
      ? "projeto"
      : t.unidade === "CIDADE"
        ? `cidade:${normalizarCidade(t.cidade)}/${(t.uf || "").toUpperCase()}`
        : `acao:${t.acaoId || ""}/${t.agendaId || ""}`;
  return `${t.modeloId || "avulsa"}|${alvo}`;
}

function normalizarCidade(c: string | null | undefined): string {
  return String(c || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

function seAplicaAoTipo(modelo: ModeloTarefa, tipoId: string): boolean {
  return modelo.tiposAcao.length === 0 || modelo.tiposAcao.includes(tipoId);
}

/**
 * Tarefas que o projeto deve ter segundo os modelos ativos.
 * - Nível 1: uma por modelo.
 * - Unidade ACAO: uma por realização (data) de cada ação do tipo certo;
 *   ação sem agenda recebe uma tarefa sem prazo.
 * - Unidade CIDADE: uma por cidade da agenda (execuções online não contam); o
 *   período da cidade vai do primeiro início ao último fim das execuções nela.
 */
export function gerarTarefas(params: {
  modelos: ModeloTarefa[];
  datas: DatasProjeto;
  acoes: AcaoParaGerar[];
}): TarefaGerada[] {
  const out: TarefaGerada[] = [];
  const modelos = params.modelos.filter((m) => m.ativo).sort((a, b) => a.ordem - b.ordem);

  const periodo = (ag: { data: Date; dataFim?: Date | null }): PeriodoAcao => ({
    inicio: ag.data,
    fim: ag.dataFim && ag.dataFim > ag.data ? ag.dataFim : ag.data,
  });
  const cidades = new Map<string, { cidade: string; uf: string; periodo: PeriodoAcao; tipos: Set<string> }>();
  for (const a of params.acoes) {
    for (const ag of a.agenda) {
      if (ag.online || !ag.cidade.trim()) continue;
      const k = `${normalizarCidade(ag.cidade)}/${ag.uf.toUpperCase()}`;
      const p = periodo(ag);
      const c = cidades.get(k);
      if (c) {
        if (p.inicio < c.periodo.inicio) c.periodo.inicio = p.inicio;
        if (p.fim > c.periodo.fim) c.periodo.fim = p.fim;
        c.tipos.add(a.tipoId);
      } else {
        cidades.set(k, { cidade: ag.cidade.trim(), uf: ag.uf.toUpperCase(), periodo: { ...p }, tipos: new Set([a.tipoId]) });
      }
    }
  }

  for (const m of modelos) {
    const base = {
      modeloId: m.id,
      area: m.area,
      nivel: m.nivel,
      fase: m.fase,
      titulo: m.titulo,
      detalhamento: m.detalhamento,
      unidade: m.unidade,
      ordem: m.ordem,
    };
    if (m.unidade === "PROJETO") {
      out.push({ ...base, acaoId: null, agendaId: null, cidade: null, uf: null, prazo: calcularPrazo(m, params.datas) });
    } else if (m.unidade === "ACAO") {
      for (const a of params.acoes) {
        if (!seAplicaAoTipo(m, a.tipoId)) continue;
        if (!a.agenda.length) {
          out.push({ ...base, acaoId: a.id, agendaId: null, cidade: null, uf: null, prazo: null });
          continue;
        }
        for (const ag of a.agenda) {
          out.push({
            ...base,
            acaoId: a.id,
            agendaId: ag.id,
            cidade: ag.cidade.trim() || null,
            uf: ag.uf.toUpperCase() || null,
            prazo: calcularPrazo(m, params.datas, periodo(ag)),
          });
        }
      }
    } else {
      for (const c of cidades.values()) {
        if (m.tiposAcao.length && ![...c.tipos].some((t) => m.tiposAcao.includes(t))) continue;
        out.push({
          ...base,
          acaoId: null,
          agendaId: null,
          cidade: c.cidade,
          uf: c.uf,
          prazo: calcularPrazo(m, params.datas, c.periodo),
        });
      }
    }
  }
  return out;
}

/** Só o que falta criar (compara pela chave com as tarefas que o projeto já tem). */
export function tarefasFaltantes(
  geradas: TarefaGerada[],
  existentes: Array<Parameters<typeof chaveTarefa>[0]>,
): TarefaGerada[] {
  const tem = new Set(existentes.map(chaveTarefa));
  return geradas.filter((t) => !tem.has(chaveTarefa(t)));
}
