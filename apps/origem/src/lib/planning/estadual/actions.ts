"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { persistHomologatedSheet } from "@/lib/planning/persist-sheet";
import { parseStateHomologatedFile } from "@/lib/planning/estadual/state-file";
import {
  revalidatePlanning,
  readFluxoContextFromForm,
  syncFluxoProjeto,
} from "@/lib/planning/server-utils";
import type { ActionState } from "@/lib/planning/action-state";

export async function startPlanningProjectState(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "");
  const externalCode = String(formData.get("externalCode") || "").trim();
  const rulesetVersion = String(formData.get("rulesetVersion") || "").trim();
  const jurisdiction = String(formData.get("jurisdiction") || "").trim();
  const file = formData.get("sheetFile");

  if (!accountId || !externalCode || !rulesetVersion || !jurisdiction) {
    return { error: "Preencha UF, proponente, código e norma" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Envie o arquivo da planilha homologada" };
  }

  const account = await prisma.salicAccount.findFirst({
    where: { id: accountId, workspaceId: entitlements.workspaceId },
  });
  if (!account) return { error: "Proponente inválido" };

  const existing = await prisma.planningProject.findUnique({
    where: {
      workspaceId_accountId_externalCode: {
        workspaceId: entitlements.workspaceId,
        accountId,
        externalCode,
      },
    },
  });
  if (existing?.importedAt) {
    return { error: "Este código já foi iniciado neste proponente" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseStateHomologatedFile(buffer, file.name);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao ler a planilha",
    };
  }

  const project =
    existing ||
    (await prisma.planningProject.create({
      data: {
        workspaceId: entitlements.workspaceId,
        accountId,
        jurisdiction,
        rulesetVersion,
        externalCode,
        name: externalCode,
      },
    }));

  if (existing) {
    await prisma.planningProject.update({
      where: { id: existing.id },
      data: { rulesetVersion, jurisdiction },
    });
  }

  await persistHomologatedSheet({
    planningProjectId: project.id,
    lines: parsed.lines,
    totalApproved: parsed.totalApproved,
    sourceFilename: file.name,
    importSource: "STATE_FILE",
  });

  const fluxoErr = await syncFluxoProjeto({
    pronac: externalCode,
    nome: project.name || externalCode,
    proponente: account.name,
    ...readFluxoContextFromForm(formData),
  });
  if (fluxoErr) return { error: fluxoErr };

  revalidatePlanning(project.id);
  redirect(`/planejamento/${project.id}`);
}
