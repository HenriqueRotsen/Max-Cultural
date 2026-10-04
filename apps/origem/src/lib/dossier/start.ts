"use server";

import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertAccountInWorkspace } from "@/lib/auth/workspace";
import { accountStoragePrefix } from "@/lib/dossier/paths";
import { dispatchDossierJob } from "@/lib/dossier/run";

export type StartLegalDossierResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

const STALE_MS = 8 * 60 * 1000;

/**
 * Inicia dossiê legal por proponente.
 * Mutex: recusa se já houver job pending|running no workspace.
 */
export async function startLegalDossierAction(input: {
  accountId: string;
  /** Project.id (auditoria) — opcional; null = todos os PRONACs da conta. */
  projectId?: string | null;
}): Promise<StartLegalDossierResult> {
  const { entitlements } = await getWorkspaceContext();
  const workspaceId = entitlements.workspaceId;
  await assertAccountInWorkspace(input.accountId, workspaceId);

  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        salicAccountId: input.accountId,
        salicAccount: { workspaceId },
      },
      select: { id: true },
    });
    if (!project) {
      return { ok: false, error: "Projeto não encontrado neste proponente" };
    }
  }

  // Libera mutex se o job anterior ficou órfão (função morta / timeout).
  const staleBefore = new Date(Date.now() - STALE_MS);
  await prisma.legalDossierJob.updateMany({
    where: {
      workspaceId,
      status: { in: ["pending", "running"] },
      updatedAt: { lt: staleBefore },
    },
    data: {
      status: "error",
      errorMessage: "Dossiê expirado sem conclusão — tente novamente.",
      progressMsg: "Falhou",
      finishedAt: new Date(),
    },
  });

  const busy = await prisma.legalDossierJob.findFirst({
    where: {
      workspaceId,
      status: { in: ["pending", "running"] },
    },
    select: { id: true, accountId: true },
  });
  if (busy) {
    return {
      ok: false,
      error: "Aguarde o dossiê em andamento. Só é possível gerar um dossiê por vez neste workspace.",
    };
  }

  const job = await prisma.legalDossierJob.create({
    data: {
      workspaceId,
      accountId: input.accountId,
      projectId: input.projectId || null,
      status: "pending",
      progressPct: 0,
      progressMsg: "Na fila…",
      storagePrefix: accountStoragePrefix(workspaceId, input.accountId),
    },
  });

  after(() =>
    dispatchDossierJob(job.id).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.legalDossierJob.update({
        where: { id: job.id },
        data: {
          status: "error",
          errorMessage: message,
          progressMsg: "Falhou",
          finishedAt: new Date(),
        },
      });
    }),
  );

  return { ok: true, jobId: job.id };
}
