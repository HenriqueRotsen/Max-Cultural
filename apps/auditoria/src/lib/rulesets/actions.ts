"use server";

/** Cadastro, edição e exclusão de INs na Auditoria (capacidade do hub `auditoria.ins.editar`). */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/session";
import { hasHubPermission } from "@/lib/auth/hub-permissions";
import { postHubAudit } from "@/lib/hub-audit";
import {
  RULESET_EDIT_PERMISSION,
  formToCaps,
  slugifyRulesetVersion,
  validateRulesetForm,
  type RulesetFormValues,
} from "@/lib/rulesets/form";

type Result = { ok: true; id: string } | { ok: false; error: string; step?: 1 | 2 | 3 };

const NO_PERMISSION = "Você não tem permissão para alterar as INs. Peça acesso ao administrador.";

function revalidateRulesetScreens() {
  revalidatePath("/observados");
  revalidatePath("/panorama");
  revalidatePath("/panorama/pronac", "layout");
  revalidatePath("/auditoria");
}

/** Recalcula o briefing dos PRONACs que usam a IN (poucos por vez). */
async function refreshProjects(projectIds: string[], options: { rechoose: boolean }) {
  if (!projectIds.length) return;
  const { ensureProjectRuleset } = await import("@/lib/compliance/choose-ruleset");
  for (let i = 0; i < projectIds.length; i += 4) {
    await Promise.all(
      projectIds.slice(i, i + 4).map((id) =>
        ensureProjectRuleset(id, options.rechoose ? undefined : { forceBriefRefresh: true }).catch(
          (err) => {
            console.warn("[ins] falha ao atualizar PRONAC", id, err instanceof Error ? err.message : err);
          },
        ),
      ),
    );
  }
}

async function uniqueVersion(sourceCode: string) {
  const base = slugifyRulesetVersion(sourceCode);
  let version = base;
  for (let n = 2; await prisma.complianceRuleset.findUnique({ where: { version }, select: { id: true } }); n++) {
    version = `${base}-${n}`;
  }
  return version;
}

export async function saveRuleset(values: RulesetFormValues): Promise<Result> {
  const session = await requireUser();
  if (!(await hasHubPermission(RULESET_EDIT_PERMISSION))) return { ok: false, error: NO_PERMISSION };

  const invalid = validateRulesetForm(values);
  if (invalid) return { ok: false, error: invalid.message, step: invalid.step };

  const sourceCode = values.sourceCode.trim();
  const duplicate = await prisma.complianceRuleset.findFirst({
    where: {
      sourceCode: { equals: sourceCode, mode: "insensitive" },
      deletedAt: null,
      ...(values.id ? { id: { not: values.id } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) return { ok: false, error: "Já existe uma IN com esse nome.", step: 1 };

  const previous = values.id
    ? await prisma.complianceRuleset.findFirst({ where: { id: values.id, deletedAt: null } })
    : null;
  if (values.id && !previous) return { ok: false, error: "Esta IN não existe mais. Recarregue a página." };

  const data = {
    sourceCode,
    sourceUrl: values.sourceUrl.trim(),
    effectiveFrom: new Date(`${values.effectiveFrom}T00:00:00Z`),
    effectiveTo: values.effectiveTo ? new Date(`${values.effectiveTo}T00:00:00Z`) : null,
    caps: formToCaps(values, previous?.caps as Record<string, unknown> | null) as unknown as Prisma.InputJsonValue,
    status: values.isDefault ? ("active" as const) : previous?.status === "draft" ? ("draft" as const) : ("archived" as const),
    needsReview: false,
    editedAt: new Date(),
    editedByEmail: session.email,
  };

  const saved = await prisma.$transaction(async (tx) => {
    // Só uma IN padrão (federal) por vez.
    if (values.isDefault) {
      await tx.complianceRuleset.updateMany({
        where: {
          status: "active",
          jurisdiction: previous?.jurisdiction ?? "FEDERAL",
          ...(previous ? { id: { not: previous.id } } : {}),
        },
        data: { status: "archived" },
      });
    }
    return previous
      ? tx.complianceRuleset.update({ where: { id: previous.id }, data })
      : tx.complianceRuleset.create({
          data: {
            ...data,
            version: await uniqueVersion(sourceCode),
            jurisdiction: "FEDERAL",
            kind: "BOTH",
          },
        });
  });

  await postHubAudit({
    action: previous ? "auditoria.in.editada" : "auditoria.in.criada",
    screen: "auditoria.ins",
    entityType: "ComplianceRuleset",
    entityId: saved.id,
    meta: { sourceCode, version: saved.version },
  }).catch(() => false);

  if (previous) {
    const projects = await prisma.project.findMany({
      where: { complianceRulesetId: saved.id },
      select: { id: true },
    });
    await refreshProjects(
      projects.map((p) => p.id),
      { rechoose: false },
    );
  }

  revalidateRulesetScreens();
  return { ok: true, id: saved.id };
}

/** Quantos PRONACs (deste workspace e no total) usam a IN — mostrado na confirmação de exclusão. */
export async function rulesetUsage(id: string) {
  await requireUser();
  const ruleset = await prisma.complianceRuleset.findUnique({
    where: { id },
    select: { version: true },
  });
  if (!ruleset) return { projects: 0, planning: 0 };
  const [projects, planning] = await Promise.all([
    prisma.project.count({ where: { complianceRulesetId: id } }),
    countPlanningProjects(ruleset.version),
  ]);
  return { projects, planning };
}

/** Projetos do Planejamento (MAX Financeiro) que referenciam a IN — bloqueiam a exclusão. */
async function countPlanningProjects(version: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM "financeiro"."planning_projects" WHERE "rulesetVersion" = ${version}
    `;
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

/** Exclusão com confirmação dupla: a 2ª etapa exige digitar o nome da IN. */
export async function deleteRuleset(params: { id: string; confirmName: string }): Promise<
  { ok: true; moved: number } | { ok: false; error: string }
> {
  await requireUser();
  if (!(await hasHubPermission(RULESET_EDIT_PERMISSION))) return { ok: false, error: NO_PERMISSION };

  const ruleset = await prisma.complianceRuleset.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!ruleset) return { ok: false, error: "Esta IN já foi excluída. Recarregue a página." };
  if (params.confirmName.trim().toLowerCase() !== ruleset.sourceCode.trim().toLowerCase()) {
    return { ok: false, error: "O nome digitado não confere com o da IN." };
  }

  const planning = await countPlanningProjects(ruleset.version);
  if (planning > 0) {
    return {
      ok: false,
      error: `Esta IN é usada por ${planning} projeto(s) do Planejamento no MAX Financeiro. Troque a IN desses projetos antes de excluir.`,
    };
  }

  const projects = await prisma.project.findMany({
    where: { complianceRulesetId: ruleset.id },
    select: { id: true },
  });

  await prisma.$transaction([
    // PRONACs voltam para "sem IN" e são reavaliados pela escolha automática.
    prisma.project.updateMany({
      where: { complianceRulesetId: ruleset.id },
      data: { complianceRulesetId: null, rulesetLocked: false, rulesetSource: null },
    }),
    prisma.complianceRuleset.update({
      where: { id: ruleset.id },
      data: { deletedAt: new Date(), status: "archived" },
    }),
  ]);

  await postHubAudit({
    action: "auditoria.in.excluida",
    screen: "auditoria.ins",
    entityType: "ComplianceRuleset",
    entityId: ruleset.id,
    meta: { sourceCode: ruleset.sourceCode, version: ruleset.version, projects: projects.length },
  }).catch(() => false);

  await refreshProjects(
    projects.map((p) => p.id),
    { rechoose: true },
  );

  revalidateRulesetScreens();
  return { ok: true, moved: projects.length };
}
