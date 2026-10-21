import type { Prisma } from "@prisma/client";

export const SOCIO_COHORT_PARAM = "perfil";

export type SocioCohort = "inscritos" | "selecionados" | "certificados";

export const SOCIO_COHORTS: Array<{
  id: SocioCohort;
  label: string;
  noun: string;
}> = [
  { id: "inscritos", label: "Inscritos", noun: "inscrição(ões)" },
  { id: "selecionados", label: "Selecionados", noun: "selecionado(s)" },
  { id: "certificados", label: "Certificados", noun: "certificado(s)" },
];

export function parseSocioCohort(raw: unknown): SocioCohort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "selecionados" || v === "certificados") return v;
  return "inscritos";
}

export function socioCohortWhere(
  cohort: SocioCohort,
): Prisma.InscricaoWhereInput {
  if (cohort === "selecionados") return { selecionados: { gt: 0 } };
  if (cohort === "certificados") return { certificado: { gt: 0 } };
  return {};
}

export function andSocioCohort(
  where: Prisma.InscricaoWhereInput,
  cohort: SocioCohort = "inscritos",
): Prisma.InscricaoWhereInput {
  const extra = socioCohortWhere(cohort);
  if (Object.keys(extra).length === 0) return where;
  if (Object.keys(where).length === 0) return extra;
  return { AND: [where, extra] };
}

export type SocioBucket = {
  label: string;
  count: number;
  pct: number;
};

export type SocioBreakdown = {
  total: number;
  genero: SocioBucket[];
  etnia: SocioBucket[];
  escolaridade: SocioBucket[];
  idade: SocioBucket[];
  deficienca: SocioBucket[];
};
