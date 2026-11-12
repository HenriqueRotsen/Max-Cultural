"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { lookupCnpj } from "@/lib/catalog/brasil-api";
import { normalizeCgccpf } from "@/lib/format";
import { loadJobsReport } from "@/lib/planning/jobs-report-db";
import type { ActionState } from "@/lib/planning/action-state";

const UFS = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "),
);
/** Por clique: a consulta à Receita é lenta e tem limite de uso. */
const MAX_LOOKUPS = 25;

/** Completa cidade/UF dos CNPJs sem endereço, consultando a Receita. */
export async function fillJobCitiesFromReceita(planningProjectId: string): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const report = await loadJobsReport(planningProjectId, ws, { onlyPaid: false });
  const targets = report.missing.filter((p) => p.doc.length === 14).slice(0, MAX_LOOKUPS);
  if (targets.length === 0) {
    return { ok: true, message: "Nenhum CNPJ sem cidade. Os CPFs precisam ser preenchidos à mão." };
  }
  let filled = 0;
  for (const p of targets) {
    const found = await lookupCnpj(p.doc);
    if (!found?.city || !found.state) continue;
    await prisma.catalogSupplier.upsert({
      where: { workspaceId_cnpj: { workspaceId: ws, cnpj: p.doc } },
      create: { workspaceId: ws, cnpj: p.doc, name: p.name, city: found.city, state: found.state },
      update: { city: found.city, state: found.state },
    });
    filled += 1;
  }
  revalidatePath(`/planejamento/${planningProjectId}/empregos`);
  const rest = report.missing.filter((p) => p.doc.length === 14).length - targets.length;
  return {
    ok: true,
    message:
      `${filled} de ${targets.length} CNPJ(s) com cidade preenchida.` +
      (rest > 0 ? ` Faltam ${rest}: clique de novo.` : ""),
  };
}

/** Cidade/UF à mão (CPF não tem consulta pública de endereço). */
export async function setJobCity(
  planningProjectId: string,
  doc: string,
  name: string,
  city: string,
  state: string,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const ws = entitlements.workspaceId;
  const cnpj = normalizeCgccpf(doc);
  const c = city.trim();
  const uf = state.trim().toUpperCase();
  if (cnpj.length !== 11 && cnpj.length !== 14) return { error: "CPF/CNPJ inválido." };
  if (c.length < 2) return { error: "Informe a cidade." };
  if (!UFS.has(uf)) return { error: "UF inválida (ex.: MG)." };
  await prisma.catalogSupplier.upsert({
    where: { workspaceId_cnpj: { workspaceId: ws, cnpj } },
    create: { workspaceId: ws, cnpj, name: name.trim() || cnpj, city: c, state: uf },
    update: { city: c, state: uf },
  });
  revalidatePath(`/planejamento/${planningProjectId}/empregos`);
  return { ok: true };
}
