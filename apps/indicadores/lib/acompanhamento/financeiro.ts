import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type FinanceiroProjeto = {
  id: string;
  nome: string | null;
  /** PRONAC (federal) ou código do projeto nas outras leis. */
  codigo: string;
  /** FEDERAL ou a UF (leis estaduais). */
  esfera: string;
  situacao: string | null;
  valorCaptado: number | null;
  captadoTransferido: number | null;
};

type Linha = {
  id: string;
  name: string | null;
  externalCode: string;
  jurisdiction: string;
  situacao: string | null;
  valorCaptado: unknown;
  captadoTransferido: unknown;
};

const num = (v: unknown) => (v == null ? null : Number(v));
const paraProjeto = (r: Linha): FinanceiroProjeto => ({
  id: r.id,
  nome: r.name,
  codigo: r.externalCode,
  esfera: r.jurisdiction,
  situacao: r.situacao,
  valorCaptado: num(r.valorCaptado),
  captadoTransferido: num(r.captadoTransferido),
});

/**
 * Projetos do Planejamento (MAX Financeiro) — só leitura.
 * Os dois apps usam o mesmo banco (schemas `indicadores` e `financeiro`); a
 * leitura direta evita uma chamada HTTP entre apps só para 3 números.
 * Sem o schema financeiro devolve vazio (nunca quebra o acompanhamento).
 */
async function consultar(filtro: Prisma.Sql, limite = 1): Promise<FinanceiroProjeto[]> {
  try {
    const rows = await prisma.$queryRaw<Linha[]>`
      SELECT id, name, "externalCode", jurisdiction, situacao, "valorCaptado", "captadoTransferido"
      FROM "financeiro"."planning_projects"
      WHERE "lifecycleStatus" <> 'ENCERRADO' AND ${filtro}
      ORDER BY "importedAt" DESC NULLS LAST, name ASC
      LIMIT ${limite}
    `;
    return rows.map(paraProjeto);
  } catch {
    return [];
  }
}

/** Projeto federal com o mesmo PRONAC. */
export async function buscarProjetoFinanceiro(pronac: string): Promise<FinanceiroProjeto | null> {
  const codigo = String(pronac || "").replace(/\D/g, "");
  if (!codigo) return null;
  const [r] = await consultar(Prisma.sql`regexp_replace("externalCode", '\\D', '', 'g') = ${codigo}`);
  return r ?? null;
}

/** Projeto do Planejamento pelo id (vínculo já feito, por PRONAC ou pela gestão). */
export async function buscarProjetoFinanceiroPorId(id: string): Promise<FinanceiroProjeto | null> {
  if (!id) return null;
  const [r] = await consultar(Prisma.sql`id = ${id}`);
  return r ?? null;
}

/** Busca por nome ou código, para a gestão vincular projetos de outras leis. */
export async function listarProjetosFinanceiro(q: string): Promise<FinanceiroProjeto[]> {
  const termo = `%${q.trim()}%`;
  return consultar(
    q.trim() ? Prisma.sql`(name ILIKE ${termo} OR "externalCode" ILIKE ${termo})` : Prisma.sql`TRUE`,
    30,
  );
}

/** Regra do "recurso liberado": já houve transferência para a conta de movimentação. */
export function recursoFoiLiberado(fin: FinanceiroProjeto | null): boolean {
  return Boolean(fin && fin.captadoTransferido != null && fin.captadoTransferido > 0);
}

/** "Federal · PRONAC 240001" ou "MG · código 2024-015". */
export function financeiroLabel(fin: Pick<FinanceiroProjeto, "esfera" | "codigo">): string {
  return fin.esfera === "FEDERAL" ? `Federal · PRONAC ${fin.codigo}` : `${fin.esfera} · código ${fin.codigo}`;
}
