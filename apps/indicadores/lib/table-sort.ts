import type { Prisma } from "@prisma/client";

export type SortDir = "asc" | "desc";

export function parseSortDir(raw?: string): SortDir {
  return raw === "desc" ? "desc" : "asc";
}

export function toggleSortDir(
  currentKey: string | null | undefined,
  currentDir: SortDir | undefined,
  nextKey: string,
): SortDir {
  if (currentKey === nextKey && currentDir === "asc") return "desc";
  return "asc";
}

export function compareSortValues(
  a: string | number,
  b: string | number,
  dir: SortDir,
): number {
  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "pt-BR", {
          numeric: true,
          sensitivity: "base",
        });
  return dir === "asc" ? cmp : -cmp;
}

const INSCRICAO_SORT_KEYS = new Set([
  "nome",
  "cpf",
  "projeto",
  "oficina",
  "cidade",
  "estado",
  "createdAt",
]);

export function inscricaoOrderBy(
  sort?: string,
  dir?: SortDir,
): Prisma.InscricaoOrderByWithRelationInput {
  const d = parseSortDir(dir);
  switch (sort) {
    case "cpf":
      return { cpf: d };
    case "projeto":
      return { nomeProjeto: d };
    case "oficina":
      return { nomeOficina: d };
    case "cidade":
      return { cidade: d };
    case "estado":
      return { estado: d };
    case "createdAt":
      return { createdAt: d };
    case "nome":
    default:
      return { nome: d };
  }
}

export function parseInscricaoSort(sort?: string) {
  return sort && INSCRICAO_SORT_KEYS.has(sort) ? sort : "createdAt";
}

export function contextoOrderBy(
  sort?: string,
  dir?: SortDir,
): Prisma.ContextoOrderByWithRelationInput {
  const d = parseSortDir(dir);
  if (sort === "projetos") return { projetos: { _count: d } };
  return { nome: d };
}

export function projetoOrderBy(
  sort?: string,
  dir?: SortDir,
): Prisma.ProjetoOrderByWithRelationInput {
  const d = parseSortDir(dir);
  switch (sort) {
    case "pronac":
      return { pronac: d };
    case "proponente":
      return { proponente: d };
    case "contexto":
      return { contexto: { nome: d } };
    case "ano":
      return { ano: d };
    case "nome":
    default:
      return { nome: d };
  }
}

export function oficinaOrderBy(
  sort?: string,
  dir?: SortDir,
): Prisma.OficinaOrderByWithRelationInput {
  const d = parseSortDir(dir);
  switch (sort) {
    case "projeto":
      return { projeto: { nome: d } };
    case "contexto":
      return { projeto: { contexto: { nome: d } } };
    case "nome":
    default:
      return { nome: d };
  }
}

export function auditOrderBy(
  sort?: string,
  dir?: SortDir,
): Prisma.AuditLogOrderByWithRelationInput {
  const d = parseSortDir(dir);
  switch (sort) {
    case "action":
      return { action: d };
    case "entity":
      return { entityType: d };
    case "actor":
      return { actor: { name: d } };
    case "createdAt":
    default:
      return { createdAt: d };
  }
}
