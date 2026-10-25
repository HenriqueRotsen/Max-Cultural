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
  const projectName = String(formData.get("projectName") || "").trim().slice(0, 300);
  const hasFile = file instanceof File && file.size > 0;

  if (!accountId || !externalCode || !rulesetVersion || !jurisdiction || !projectName) {
    return { error: "Preencha UF, proponente, norma, código e nome do projeto" };
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
        rulesetVersion,
        externalCode,
        name: projectName,
        sheetSearchActive: false,
      },
    }));

  if (existing) {
    await prisma.planningProject.update({
      where: { id: existing.id },
      data: { rulesetVersion, jurisdiction, name: projectName, sheetSearchActive: false },
    });
  }

  await persistHomologatedSheet({
    planningProjectId: project.id,
    lines: parsed.lines,
    totalApproved: parsed.totalApproved,
    sourceFilename: hasFile ? file.name : null,
    importSource: hasFile ? "STATE_FILE" : "STATE_MANUAL",
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
