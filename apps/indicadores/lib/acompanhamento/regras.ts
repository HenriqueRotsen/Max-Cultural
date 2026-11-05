/**
 * Regras do acompanhamento de Comunicação e Produção (sem banco: testáveis).
 *
 * - Prazo = data base (início/fim da execução ou data da ação) + dias do modelo.
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
export type PrazoBase = "INICIO_EXECUCAO" | "FIM_EXECUCAO" | "DATA_ACAO";
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

/** Prazo de uma tarefa; `dataAcao` é a data da realização (ou da cidade). */
export function calcularPrazo(
  modelo: Pick<ModeloTarefa, "prazoBase" | "prazoDias">,
  datas: DatasProjeto,
  dataAcao?: Date | null,
): Date | null {
  if (!modelo.prazoBase || modelo.prazoDias == null) return null;
  const base =
    modelo.prazoBase === "INICIO_EXECUCAO"
      ? datas.inicioExecucao
      : modelo.prazoBase === "FIM_EXECUCAO"
        ? datas.fimExecucao
        : (dataAcao ?? null);
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
  agenda: Array<{ id: string; cidade: string; uf: string; data: Date }>;
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
 * - Unidade CIDADE: uma por cidade da agenda; prazo a partir da 1ª data da
 *   cidade (fases Antes/Durante) ou da última (Depois).
 */
export function gerarTarefas(params: {
  modelos: ModeloTarefa[];
  datas: DatasProjeto;
  acoes: AcaoParaGerar[];
}): TarefaGerada[] {
  const out: TarefaGerada[] = [];
  const modelos = params.modelos.filter((m) => m.ativo).sort((a, b) => a.ordem - b.ordem);

  const cidades = new Map<string, { cidade: string; uf: string; datas: Date[]; tipos: Set<string> }>();
  for (const a of params.acoes) {
    for (const ag of a.agenda) {
      const k = `${normalizarCidade(ag.cidade)}/${ag.uf.toUpperCase()}`;
      const c = cidades.get(k) || { cidade: ag.cidade.trim(), uf: ag.uf.toUpperCase(), datas: [], tipos: new Set() };
      c.datas.push(ag.data);
      c.tipos.add(a.tipoId);
      cidades.set(k, c);
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
            cidade: ag.cidade.trim(),
            uf: ag.uf.toUpperCase(),
            prazo: calcularPrazo(m, params.datas, ag.data),
          });
        }
      }
    } else {
      for (const c of cidades.values()) {
        if (m.tiposAcao.length && ![...c.tipos].some((t) => m.tiposAcao.includes(t))) continue;
        const ordenadas = [...c.datas].sort((x, y) => x.getTime() - y.getTime());
        const ref = m.fase === "DEPOIS" ? ordenadas[ordenadas.length - 1]! : ordenadas[0]!;
        out.push({
          ...base,
          acaoId: null,
          agendaId: null,
          cidade: c.cidade,
          uf: c.uf,
          prazo: calcularPrazo(m, params.datas, ref),
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
