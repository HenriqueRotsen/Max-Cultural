import { prisma } from "@/lib/prisma";

export type FinanceiroProjeto = {
  id: string;
  nome: string | null;
  situacao: string | null;
  valorCaptado: number | null;
  captadoTransferido: number | null;
};

/**
 * Projeto do Planejamento (MAX Financeiro) com o mesmo PRONAC — só leitura.
 * Os dois apps usam o mesmo banco (schemas `indicadores` e `financeiro`); a
 * leitura direta evita uma chamada HTTP entre apps só para 3 números.
 * Sem o schema financeiro (ex.: banco local do Indicadores) devolve null.
 */
export async function buscarProjetoFinanceiro(pronac: string): Promise<FinanceiroProjeto | null> {
  const codigo = String(pronac || "").replace(/\D/g, "");
  if (!codigo) return null;
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string | null;
        situacao: string | null;
        valorCaptado: unknown;
        captadoTransferido: unknown;
      }>
    >`
      SELECT id, name, situacao, "valorCaptado", "captadoTransferido"
      FROM "financeiro"."planning_projects"
      WHERE regexp_replace("externalCode", '\\D', '', 'g') = ${codigo}
        AND "lifecycleStatus" <> 'ENCERRADO'
      ORDER BY "importedAt" DESC NULLS LAST
      LIMIT 1
    `;
    const r = rows[0];
    if (!r) return null;
    const num = (v: unknown) => (v == null ? null : Number(v));
    return {
      id: r.id,
      nome: r.name,
      situacao: r.situacao,
      valorCaptado: num(r.valorCaptado),
      captadoTransferido: num(r.captadoTransferido),
    };
  } catch {
    return null;
  }
}

/** Regra do "recurso liberado": já houve transferência para a conta de movimentação. */
export function recursoFoiLiberado(fin: FinanceiroProjeto | null): boolean {
  return Boolean(fin && fin.captadoTransferido != null && fin.captadoTransferido > 0);
}
