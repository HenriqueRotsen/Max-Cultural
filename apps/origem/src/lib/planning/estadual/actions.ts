"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { persistHomologatedSheet } from "@/lib/planning/persist-sheet";
import { parseStateHomologatedFile } from "@/lib/planning/estadual/state-file";
import {
  revalidatePlanning,
} from "@/lib/planning/server-utils";
import type { ActionState } from "@/lib/planning/action-state";
import { parseProjectCaps } from "@/lib/planning/project-caps";

export async function startPlanningProjectState(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "");
  const externalCode = String(formData.get("externalCode") || "").trim();
  // Estadual não usa IN: só os limites do projeto.
  const caps = parseProjectCaps(formData);
  if ("error" in caps) return { error: caps.error };
  const jurisdiction = String(formData.get("jurisdiction") || "").trim();
  const file = formData.get("sheetFile");
  const projectName = String(formData.get("projectName") || "").trim().slice(0, 300);
  const hasFile = file instanceof File && file.size > 0;

  if (!accountId || !externalCode || !jurisdiction || !projectName) {
    return { error: "Preencha UF, proponente, código e nome do projeto" };
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

  // Arquivo é opcional: sem ele, o projeto nasce com a planilha vazia e as rubricas
  // são lançadas à mão no projeto.
  let parsed: ReturnType<typeof parseStateHomologatedFile> = { lines: [], totalApproved: 0 };
  if (hasFile) {
    try {
      parsed = parseStateHomologatedFile(Buffer.from(await file.arrayBuffer()), file.name);
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Falha ao ler a planilha",
      };
    }
  }

  const project =
    existing ||
    (await prisma.planningProject.create({
      data: {
        workspaceId: entitlements.workspaceId,
        accountId,
        jurisdiction,
        rulesetVersion: null,
        externalCode,
        name: projectName,
        sheetSearchActive: false,
        ...caps,
      },
    }));

  if (existing) {
    await prisma.planningProject.update({
      where: { id: existing.id },
      data: { rulesetVersion: null, jurisdiction, name: projectName, sheetSearchActive: false, ...caps },
    });
  }

  await persistHomologatedSheet({
    planningProjectId: project.id,
    lines: parsed.lines,
    totalApproved: parsed.totalApproved,
    sourceFilename: hasFile ? file.name : null,
    importSource: hasFile ? "STATE_FILE" : "STATE_MANUAL",
  });

  revalidatePlanning(project.id);
  redirect(`/planejamento/${project.id}`);
}
