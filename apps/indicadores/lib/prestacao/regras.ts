/**
 * Regras da prestação de contas (sem banco: testáveis).
 *
 * - Cada execução da ação tem uma ficha; os campos vêm do modelo (Configurações)
 *   e cada um é da Produção, da Comunicação ou da Gestão.
 * - Valor de um campo: `{ v }` ou `{ na: true }` ("não se aplica").
 * - Ano, projeto, ação, local, datas e números das inscrições vêm do sistema.
 */

import { diasEntre } from "@/lib/acompanhamento/regras";

export type EquipePrestacao = "PRODUCAO" | "COMUNICACAO" | "GESTAO";
export type TipoCampoPrestacao =
  | "TEXTO"
  | "TEXTO_LONGO"
  | "NUMERO"
  | "DATA"
  | "LINK"
  | "OPCOES"
  | "SIM_NAO"
  | "MULTIPLA"
  | "HORARIO";

export const EQUIPES: EquipePrestacao[] = ["PRODUCAO", "COMUNICACAO", "GESTAO"];

export type CampoPrestacao = {
  chave: string;
  sugestao?: string | null;
  rotulo: string;
  tipo: TipoCampoPrestacao;
  opcoes: string[];
  equipe: EquipePrestacao;
  obrigatorio: boolean;
  ativo: boolean;
};

export type ValorCampo = { v?: string | number | string[]; na?: boolean };
export type ValoresFicha = Record<string, ValorCampo>;

/** Preenchido = tem valor ou foi marcado "não se aplica". */
export function preenchido(valor: ValorCampo | undefined): boolean {
  if (!valor) return false;
  if (valor.na) return true;
  if (Array.isArray(valor.v)) return valor.v.length > 0;
  return valor.v != null && String(valor.v).trim() !== "";
}

export type ProgressoEquipe = { preenchidos: number; total: number; pct: number; faltando: string[] };

/** Quanto da parte de uma equipe está preenchido (obrigatórios primeiro em "faltando"). */
export function progressoEquipe(
  campos: CampoPrestacao[],
  valores: ValoresFicha,
  equipe: EquipePrestacao,
): ProgressoEquipe {
  const daEquipe = campos.filter((c) => c.ativo && c.equipe === equipe);
  const faltam = daEquipe.filter((c) => !preenchido(valores[c.chave]));
  const total = daEquipe.length;
  const preenchidos = total - faltam.length;
  return {
    preenchidos,
    total,
    pct: total ? Math.round((preenchidos / total) * 100) : 100,
    faltando: [...faltam.filter((c) => c.obrigatorio), ...faltam.filter((c) => !c.obrigatorio)].map((c) => c.rotulo),
  };
}

/** Converte o que foi digitado para o valor guardado, conforme o tipo do campo. */
export function normalizarValor(
  campo: Pick<CampoPrestacao, "tipo" | "opcoes" | "rotulo"> & { chave?: string },
  bruto: string,
): { ok: true; valor: string | number | string[] | null } | { ok: false; erro: string } {
  const t = bruto.trim();
  if (!t) return { ok: true, valor: null };
  switch (campo.tipo) {
    case "MULTIPLA": {
      // O formulário manda a lista como JSON.
      let lista: unknown;
      try {
        lista = JSON.parse(t);
      } catch {
        return { ok: false, erro: `${campo.rotulo}: valor inválido.` };
      }
      if (!Array.isArray(lista)) return { ok: false, erro: `${campo.rotulo}: valor inválido.` };
      const escolhidas = [...new Set(lista.map(String))].filter((o) => campo.opcoes.includes(o));
      return { ok: true, valor: escolhidas.length ? escolhidas : null };
    }
    case "HORARIO": {
      const m = t.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
      if (!m) return { ok: false, erro: `${campo.rotulo}: informe o início e o fim.` };
      const ini = Number(m[1]) * 60 + Number(m[2]);
      const fim = Number(m[3]) * 60 + Number(m[4]);
      if (ini >= fim || Number(m[1]) > 23 || Number(m[3]) > 23 || Number(m[2]) > 59 || Number(m[4]) > 59) {
        return { ok: false, erro: `${campo.rotulo}: o fim deve ser depois do início.` };
      }
      return { ok: true, valor: t };
    }
    case "NUMERO": {
      const n = Number(t.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return { ok: false, erro: `${campo.rotulo}: informe um número.` };
      return { ok: true, valor: n };
    }
    case "DATA":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: false, erro: `${campo.rotulo}: data inválida.` };
      return { ok: true, valor: t };
    case "LINK":
      if (!/^https?:\/\/\S+$/i.test(t)) return { ok: false, erro: `${campo.rotulo}: o link deve começar com http:// ou https://.` };
      if (campo.chave === "instagram" && !/^https?:\/\/(www\.)?instagram\.com\//i.test(t)) {
        return { ok: false, erro: `${campo.rotulo}: use o endereço do post no Instagram (instagram.com/…).` };
      }
      return { ok: true, valor: t.slice(0, 2000) };
    case "OPCOES":
      if (!campo.opcoes.includes(t)) return { ok: false, erro: `${campo.rotulo}: escolha uma das opções.` };
      return { ok: true, valor: t };
    case "SIM_NAO":
      if (t !== "Sim" && t !== "Não") return { ok: false, erro: `${campo.rotulo}: escolha Sim ou Não.` };
      return { ok: true, valor: t };
    case "TEXTO":
      return { ok: true, valor: t.slice(0, 500) };
    default:
      return { ok: true, valor: t.slice(0, 5000) };
  }
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Meses que o período toca: "novembro/2026" ou "novembro/2026 a janeiro/2027", e quantos são. */
export function mesesDoPeriodo(inicio: Date, fim: Date | null): { rotulo: string; quantidade: number } {
  const ate = fim && fim > inicio ? fim : inicio;
  const a = { y: inicio.getUTCFullYear(), m: inicio.getUTCMonth() };
  const b = { y: ate.getUTCFullYear(), m: ate.getUTCMonth() };
  const quantidade = (b.y - a.y) * 12 + (b.m - a.m) + 1;
  const nome = (x: { y: number; m: number }) => `${MESES[x.m]}/${x.y}`;
  return { rotulo: quantidade === 1 ? nome(a) : `${nome(a)} a ${nome(b)}`, quantidade };
}

/** "1h30" a partir de minutos. */
export function minutosEmHoras(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// ── Sugestões automáticas ────────────────────────────────────────────────

export const SUGESTOES = {
  STATUS_DATA: "Pela data da execução (Realizada / Agendada)",
  SIM: "Sim",
  PARTICIPANTES: "Participantes das inscrições",
  CARGA_HORARIA: "Calculada pelo horário × dias",
  RESPONSAVEIS: "Responsáveis da ação e nomes já usados",
  HISTORICO: "O que já foi usado em outras fichas",
  PERFIL: "Perfil das inscrições",
} as const;
export type FonteSugestao = keyof typeof SUGESTOES;

/** Que sugestões fazem sentido para cada tipo de campo (modelo da ficha). */
export const SUGESTOES_POR_TIPO: Record<TipoCampoPrestacao, FonteSugestao[]> = {
  TEXTO: ["HISTORICO", "RESPONSAVEIS"],
  TEXTO_LONGO: ["HISTORICO"],
  NUMERO: ["PARTICIPANTES", "CARGA_HORARIA", "HISTORICO"],
  DATA: [],
  LINK: [],
  OPCOES: ["STATUS_DATA", "HISTORICO"],
  SIM_NAO: ["SIM"],
  MULTIPLA: ["PERFIL"],
  HORARIO: ["HISTORICO"],
};

/** Grupos atendidos sugeridos pelo perfil das inscrições (contagens por rótulo). */
export type PerfilResumo = {
  total: number;
  genero: Record<string, number>;
  etnia: Record<string, number>;
  idade: Record<string, number>;
  pcd: number;
};

export function gruposDoPerfil(p: PerfilResumo): string[] {
  if (!p.total) return [];
  const soma = (r: Record<string, number>, chaves: string[]) => chaves.reduce((acc, k) => acc + (r[k] ?? 0), 0);
  const parte = (n: number) => n / p.total;
  const g: string[] = [];
  if (parte(soma(p.idade, ["Até 14", "15–17"])) >= 0.3) g.push("Crianças e adolescentes");
  if (parte(soma(p.idade, ["18–29"])) >= 0.3) g.push("Jovens");
  if (parte(soma(p.idade, ["60+"])) >= 0.2) g.push("Pessoas idosas");
  if (parte(soma(p.genero, ["Feminino"])) >= 0.5) g.push("Mulheres");
  if (parte(soma(p.etnia, ["Preta", "Parda"])) >= 0.5) g.push("Pessoas negras");
  if ((p.etnia["Indígena"] ?? 0) > 0) g.push("Povos indígenas");
  if (p.pcd > 0) g.push("Pessoas com deficiência");
  return g;
}

/** Minutos por dia de um horário "14:00-17:00". */
export function minutosDoHorario(h: string): number | null {
  const m = String(h || "").match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = Number(m[3]) * 60 + Number(m[4]) - (Number(m[1]) * 60 + Number(m[2]));
  return d > 0 ? d : null;
}

/** Dias corridos da execução, contando o primeiro e o último. */
export function diasDaExecucao(inicio: Date, fim: Date | null): number {
  return diasEntre(inicio, fim && fim > inicio ? fim : inicio) + 1;
}

export type ContextoSugestao = {
  hoje: Date;
  inicio: Date;
  fim: Date | null;
  participantes: number;
  responsaveis: string[];
  /** Valores já usados neste campo em outras fichas (os mais próximos primeiro). */
  historico: string[];
  perfil: PerfilResumo | null;
  /** Horário preenchido nesta ficha (para a carga horária). */
  horario: string;
};

export type Sugestao = { valor: string | number | string[]; motivo: string; alternativas: string[] };

const diaCurto = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join("/");

/** O que o sistema sugere para o campo, ou nada. Nunca é salvo sem a pessoa aceitar. */
export function sugerir(
  campo: Pick<CampoPrestacao, "sugestao" | "tipo" | "opcoes">,
  ctx: ContextoSugestao,
): Sugestao | null {
  switch (campo.sugestao) {
    case "STATUS_DATA": {
      const fim = ctx.fim && ctx.fim > ctx.inicio ? ctx.fim : ctx.inicio;
      const valor = diasEntre(ctx.hoje, fim) < 0 ? "Realizada" : "Agendada";
      if (campo.opcoes.length && !campo.opcoes.includes(valor)) return null;
      return {
        valor,
        motivo: valor === "Realizada" ? `a execução terminou em ${diaCurto(fim)}` : `a execução começa em ${diaCurto(ctx.inicio)}`,
        alternativas: [],
      };
    }
    case "SIM":
      return { valor: "Sim", motivo: "o mais comum", alternativas: [] };
    case "PARTICIPANTES":
      return ctx.participantes > 0
        ? { valor: ctx.participantes, motivo: "participantes das inscrições", alternativas: [] }
        : null;
    case "CARGA_HORARIA": {
      const porDia = minutosDoHorario(ctx.horario);
      if (!porDia) return null;
      const dias = diasDaExecucao(ctx.inicio, ctx.fim);
      return {
        valor: porDia * dias,
        motivo: `${minutosEmHoras(porDia)} por dia × ${dias} ${dias === 1 ? "dia" : "dias"}`,
        alternativas: [],
      };
    }
    case "RESPONSAVEIS": {
      const nomes = [...new Set([...ctx.responsaveis, ...ctx.historico])].filter(Boolean);
      if (!nomes.length) return null;
      return {
        valor: nomes[0]!,
        motivo: ctx.responsaveis.length ? "responsável cadastrado na ação" : "já usado em outra ficha",
        alternativas: nomes,
      };
    }
    case "HISTORICO":
      return ctx.historico.length ? { valor: ctx.historico[0]!, motivo: "já usado em outra ficha", alternativas: ctx.historico } : null;
    case "PERFIL": {
      if (!ctx.perfil) return null;
      const grupos = gruposDoPerfil(ctx.perfil).filter((g) => !campo.opcoes.length || campo.opcoes.includes(g));
      return grupos.length ? { valor: grupos, motivo: `perfil de ${ctx.perfil.total} inscrições`, alternativas: [] } : null;
    }
    default:
      return null;
  }
}
