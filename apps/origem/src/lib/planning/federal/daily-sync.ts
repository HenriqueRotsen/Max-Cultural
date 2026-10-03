import { prisma } from "@/lib/db";
import { classifyLifecycleFromSituacao } from "@/lib/planning/lifecycle";
import { listPlanningRulesets } from "@/lib/planning/rulesets";
import { linkHomologatedSheetsForOpenProjects } from "@/lib/planning/federal/import-homologada";
import { syncCaptacaoForWorkspace } from "@/lib/planning/federal/captacao-salic";
import { syncFluxoProjeto } from "@/lib/planning/server-utils";

/**
 * Leva os projetos da auditoria (já sincronizados do SALIC) para o planejamento:
 * cria os que faltam, espelha em andamento/encerrado e provisiona o contexto no Fluxo.
 */
export async function onboardPlanningFromAuditoria(
  workspaceId: string,
  accountId?: string,
): Promise<{
  created: number;
  updated: number;
}> {
  const rulesets = await listPlanningRulesets();
  const rulesetVersion = rulesets[0]?.version;
  if (!rulesetVersion) {
    throw new Error("Nenhuma norma de conformidade ativa para vincular aos projetos.");
  }

  const auditProjects = await prisma.project.findMany({
    where: { salicAccount: { workspaceId }, ...(accountId ? { salicAccountId: accountId } : {}) },
    include: {
      planningProject: { select: { id: true } },
      salicAccount: { select: { id: true, name: true } },
    },
    orderBy: { pronac: "asc" },
  });

  let created = 0;
  let updated = 0;

  for (const p of auditProjects) {
    const lifecycle =
      p.lifecycleStatus === "ENCERRADO"
        ? "ENCERRADO"
        : classifyLifecycleFromSituacao(p.situacao);

    if (p.planningProject) {
      await prisma.planningProject.update({
        where: { id: p.planningProject.id },
        data: { lifecycleStatus: lifecycle, name: p.name || undefined },
      });
      if (p.lifecycleStatus !== lifecycle) {
        await prisma.project.update({
          where: { id: p.id },
          data: { lifecycleStatus: lifecycle },
        });
      }
      updated += 1;
    } else {
      await prisma.planningProject.create({
        data: {
          workspaceId,
          accountId: p.salicAccountId,
          jurisdiction: "FEDERAL",
          rulesetVersion,
          externalCode: p.pronac,
          name: p.name,
          projectId: p.id,
          lifecycleStatus: lifecycle,
        },
      });
      created += 1;
    }

    await syncFluxoProjeto({
      pronac: p.pronac,
      nome: p.name || p.pronac,
      proponente: p.salicAccount.name,
      bulk: true,
    });
  }

  return { created, updated };
}

/**
 * Etapa de planejamento do sync diário (roda depois da auditoria):
 * onboard → planilha homologada dos projetos em andamento → captação.
 */
export async function syncPlanningForWorkspace(
  workspaceId: string,
  accountId?: string,
  log: (message: string) => Promise<void> = async () => {},
) {
  const onboard = await onboardPlanningFromAuditoria(workspaceId, accountId);
  await log(
    `Planejamento: ${onboard.created} projeto(s) novo(s), ${onboard.updated} atualizado(s) · contextos no Fluxo conferidos`,
  );

  const sheets = await linkHomologatedSheetsForOpenProjects(workspaceId, accountId);
  await log(
    `Planejamento: ${sheets.linked} planilha(s) homologada(s) vinculada(s)` +
      (sheets.skipped ? ` · ${sheets.skipped} ignorada(s)` : "") +
      (sheets.errors.length ? ` · ${sheets.errors.slice(0, 3).join(" · ")}` : ""),
  );

  const captacao = await syncCaptacaoForWorkspace(workspaceId, accountId);
  await log(
    `Planejamento: captação atualizada em ${captacao.synced} projeto(s)` +
      (captacao.errors.length ? ` · ${captacao.errors.slice(0, 3).join(" · ")}` : ""),
  );

  return { onboard, sheets, captacao };
}
