"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { hasHubPermission } from "@/lib/auth/hub-permissions";
import { postHubAudit } from "@/lib/hub-audit";
import {
  AUTO_SYNC_CONFIRM_WORD,
  AUTO_SYNC_PERMISSION,
  type AutoSyncState,
} from "@/lib/sync/auto-sync-shared";

/**
 * Liga/desliga a atualização diária com o SALIC no workspace.
 * Desligar exige a capacidade do hub e a palavra de confirmação (2ª etapa).
 */
export async function setSalicAutoSync(
  _prev: AutoSyncState,
  formData: FormData,
): Promise<AutoSyncState> {
  const session = await requireUser();
  if (!(await hasHubPermission(AUTO_SYNC_PERMISSION))) {
    return { error: "Você não tem permissão para alterar a atualização automática." };
  }
  const enable = formData.get("enable") === "1";
  const note = String(formData.get("note") || "").trim().slice(0, 500);
  if (!enable) {
    const typed = String(formData.get("confirm") || "").trim().toUpperCase();
    if (typed !== AUTO_SYNC_CONFIRM_WORD) {
      return { error: `Digite ${AUTO_SYNC_CONFIRM_WORD} para confirmar.` };
    }
    if (!note) return { error: "Informe o motivo para desativar." };
  }

  const { entitlements } = await getWorkspaceContext();
  await prisma.workspace.update({
    where: { id: entitlements.workspaceId },
    data: {
      salicAutoSync: enable,
      salicAutoSyncChangedAt: new Date(),
      salicAutoSyncChangedById: session.id,
      salicAutoSyncNote: note || null,
    },
  });
  await postHubAudit({
    action: enable ? "auditoria.atualizacao.religada" : "auditoria.atualizacao.desativada",
    screen: "auditoria.atualizacao",
    entityType: "Workspace",
    entityId: entitlements.workspaceId,
    meta: { note: note || null },
  }).catch(() => false);

  revalidatePath("/atualizacao");
  return { ok: true };
}
