/**
 * Regras da prestação de contas (sem banco: testáveis).
 *
 * - Cada execução da ação tem uma ficha; os campos vêm do modelo (Configurações)
 *   e cada um é da Produção, da Comunicação ou da Gestão.
 * - Valor de um campo: `{ v }` ou `{ na: true }` ("não se aplica").
 * - Ano, projeto, ação, local, datas e números das inscrições vêm do sistema.
 */

export type EquipePrestacao = "PRODUCAO" | "COMUNICACAO" | "GESTAO";
export type TipoCampoPrestacao = "TEXTO" | "TEXTO_LONGO" | "NUMERO" | "DATA" | "LINK" | "OPCOES" | "SIM_NAO";

export const EQUIPES: EquipePrestacao[] = ["PRODUCAO", "COMUNICACAO", "GESTAO"];

export type CampoPrestacao = {
  chave: string;
  rotulo: string;
  tipo: TipoCampoPrestacao;
  opcoes: string[];
  equipe: EquipePrestacao;
  obrigatorio: boolean;
  ativo: boolean;
};

export type ValorCampo = { v?: string | number; na?: boolean };
export type ValoresFicha = Record<string, ValorCampo>;

/** Preenchido = tem valor ou foi marcado "não se aplica". */
export function preenchido(valor: ValorCampo | undefined): boolean {
  if (!valor) return false;
  if (valor.na) return true;
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
  campo: Pick<CampoPrestacao, "tipo" | "opcoes" | "rotulo">,
  bruto: string,
): { ok: true; valor: string | number | null } | { ok: false; erro: string } {
  const t = bruto.trim();
  if (!t) return { ok: true, valor: null };
  switch (campo.tipo) {
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
