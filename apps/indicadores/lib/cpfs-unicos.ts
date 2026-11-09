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

/**
 * Acumulador de CPFs únicos por grupo (ação, cidade, linha da tabela…):
 * `add(grupo, cpf)` e depois `total(grupo)`.
 */
export function cpfsPorGrupo() {
  const grupos = new Map<string, Set<string>>();
  return {
    add(grupo: string, cpf: string | null | undefined) {
      const k = chaveCpf(cpf);
      if (!k) return;
      let s = grupos.get(grupo);
      if (!s) grupos.set(grupo, (s = new Set()));
      s.add(k);
    },
    total(grupo: string): number {
      return grupos.get(grupo)?.size ?? 0;
    },
  };
}

/** CPFs únicos das inscrições que atendem ao filtro (lê só os CPFs distintos). */
export async function cpfsUnicosDoFiltro(where: Prisma.InscricaoWhereInput): Promise<number> {
  const rows = await prisma.inscricao.findMany({
    where: { AND: [where, { cpf: { not: "" } }] },
    select: { cpf: true },
    distinct: ["cpf"],
  });
  return contarCpfsUnicos(rows.map((r) => r.cpf));
}
