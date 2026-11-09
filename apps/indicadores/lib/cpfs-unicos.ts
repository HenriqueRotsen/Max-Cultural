import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCpf } from "@/lib/normalize";

/**
 * CPFs únicos: pessoas diferentes entre as inscrições. O CPF é normalizado
 * (só dígitos, zeros à esquerda que a planilha cortou devolvidos); inscrição
 * sem CPF válido (11 dígitos) não entra na conta.
 */
export function chaveCpf(cpf: string | null | undefined): string | null {
  const d = normalizeCpf(cpf ?? "");
  return d.length === 11 ? d : null;
}

/** Quantos CPFs diferentes há na lista. */
export function contarCpfsUnicos(cpfs: Iterable<string | null | undefined>): number {
  const vistos = new Set<string>();
  for (const c of cpfs) {
    const k = chaveCpf(c);
    if (k) vistos.add(k);
  }
  return vistos.size;
}

/** CPFs únicos em cada etapa: inscritos, selecionados, participantes e certificados. */
export type CpfsUnicos = {
  inscritos: number;
  selecionados: number;
  participantes: number;
  certificados: number;
};

/** Linha de inscrição com o que importa para contar pessoas por etapa. */
export type LinhaCpf = {
  cpf?: string | null;
  selecionados?: number | null;
  participantes?: number | null;
  certificado?: number | null;
};

export const CPFS_ZERO: CpfsUnicos = { inscritos: 0, selecionados: 0, participantes: 0, certificados: 0 };

/** Conjuntos de CPFs por etapa; dá para juntar vários (mesma pessoa conta uma vez). */
export class ConjuntoCpfs {
  readonly inscritos = new Set<string>();
  readonly selecionados = new Set<string>();
  readonly participantes = new Set<string>();
  readonly certificados = new Set<string>();

  add(r: LinhaCpf) {
    const k = chaveCpf(r.cpf);
    if (!k) return;
    this.inscritos.add(k);
    if ((r.selecionados ?? 0) > 0) this.selecionados.add(k);
    if ((r.participantes ?? 0) > 0) this.participantes.add(k);
    if ((r.certificado ?? 0) > 0) this.certificados.add(k);
  }

  juntar(outro: ConjuntoCpfs) {
    for (const k of outro.inscritos) this.inscritos.add(k);
    for (const k of outro.selecionados) this.selecionados.add(k);
    for (const k of outro.participantes) this.participantes.add(k);
    for (const k of outro.certificados) this.certificados.add(k);
  }

  total(): CpfsUnicos {
    return {
      inscritos: this.inscritos.size,
      selecionados: this.selecionados.size,
      participantes: this.participantes.size,
      certificados: this.certificados.size,
    };
  }
}

/** CPFs únicos por etapa das linhas. */
export function cpfsUnicosPorEtapa(rows: Iterable<LinhaCpf>): CpfsUnicos {
  const c = new ConjuntoCpfs();
  for (const r of rows) c.add(r);
  return c.total();
}

/**
 * Acumulador de CPFs únicos por grupo (ação, cidade, linha da tabela…):
 * `add(grupo, linha)` e depois `total(grupo)`.
 */
export function cpfsPorGrupo() {
  const grupos = new Map<string, ConjuntoCpfs>();
  return {
    add(grupo: string, r: LinhaCpf) {
      let s = grupos.get(grupo);
      if (!s) grupos.set(grupo, (s = new ConjuntoCpfs()));
      s.add(r);
    },
    total(grupo: string): CpfsUnicos {
      return grupos.get(grupo)?.total() ?? { ...CPFS_ZERO };
    },
  };
}

/** CPFs únicos por etapa das inscrições que atendem ao filtro. */
export async function cpfsUnicosDoFiltro(where: Prisma.InscricaoWhereInput): Promise<CpfsUnicos> {
  const rows = await prisma.inscricao.findMany({
    where: { AND: [where, { cpf: { not: "" } }] },
    select: { cpf: true, selecionados: true, participantes: true, certificado: true },
    distinct: ["cpf", "selecionados", "participantes", "certificado"],
  });
  return cpfsUnicosPorEtapa(rows);
}
