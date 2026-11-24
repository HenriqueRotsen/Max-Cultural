"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { logPlanningAction } from "@/lib/activity-audit";
import { canDeleteNf } from "@/lib/planning/acl";
import { revalidatePlanning } from "@/lib/planning/server-utils";
import {
  attachSupportDocumentCore,
  markGroupForRepublish,
  paymentGroupIds,
} from "@/lib/planning/support-attach";
import type { ActionState } from "@/lib/planning/action-state";

/**
 * Anexa um ou vários documentos ao lançamento (ver attachSupportDocumentCore).
 * Para no primeiro que der erro e diz quais já entraram.
 */
export async function attachSupportDocument(
  commitmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const files = formData.getAll("supportFile").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Selecione o arquivo." };
  const messages: string[] = [];
  for (const file of files) {
    const r = await attachSupportDocumentCore({
      userId: session.id,
      workspaceId: entitlements.workspaceId,
      commitmentId,
      formData,
      file,
    });
    if (r.error) {
      const done = messages.length ? ` Já entraram: ${messages.length} de ${files.length}.` : "";
      return { ...r, error: `${file.name}: ${r.error}${done}` };
    }
    if (r.message) messages.push(r.message);
  }
  return { ok: true, message: messages.join(" ") };
}

/** Tira um documento de apoio do lançamento (mesma permissão de excluir NF/RPA). */
export async function removeSupportDocument(documentId: string): Promise<ActionState> {
  const session = await requireUser();
  if (!(await canDeleteNf())) {
    return { error: 'Sem permissão. Peça a permissão "Excluir NF/RPA" no MAX Cultural.' };
  }
  const { entitlements } = await getWorkspaceContext();
  const doc = await prisma.planningDocument.findFirst({
    where: { id: documentId, workspaceId: entitlements.workspaceId, kind: "SUPPORT" },
  });
  if (!doc?.commitmentId) return { error: "Documento não encontrado." };
  const groupIds = await paymentGroupIds(doc.commitmentId);
  await prisma.planningDocument.delete({ where: { id: doc.id } });
  // Era o substituto da NF: sem NF/RPA e sem outro substituto, a NF volta a ficar pendente.
  if ((doc.extractedJson as { replacesNf?: boolean } | null)?.replacesNf) {
    const [fiscal, others] = await Promise.all([
      prisma.planningDocument.count({
        where: {
          kind: { in: ["NF", "RPA"] },
          status: "IMPORTED",
          OR: [{ commitmentId: { in: groupIds } }, { allocations: { some: { commitmentId: { in: groupIds } } } }],
        },
      }),
      prisma.planningDocument.findMany({
        where: { kind: "SUPPORT", commitmentId: { in: groupIds } },
        select: { extractedJson: true },
      }),
    ]);
    const stillReplaced = others.some(
      (o) => (o.extractedJson as { replacesNf?: boolean } | null)?.replacesNf === true,
    );
    if (fiscal === 0 && !stillReplaced) {
      await prisma.rubricCommitment.updateMany({
        where: { id: { in: groupIds }, status: "PAID" },
        data: { nfPending: true },
      });
    }
  }
  const republish = await markGroupForRepublish(groupIds);
  await logPlanningAction({
    actorUserId: session.id,
    action: "planning.support_document_removed",
    entityType: "PlanningDocument",
    entityId: doc.id,
    meta: {
      planningProjectId: doc.planningProjectId,
      commitmentId: doc.commitmentId,
      supportType: doc.supportType,
      filename: doc.filename,
      storagePath: doc.storagePath,
    },
  });
  if (doc.planningProjectId) revalidatePlanning(doc.planningProjectId);
  revalidatePath(`/planejamento/compromissos/${doc.commitmentId}`);
  return {
    ok: true,
    message:
      "Documento removido." +
      (republish > 0 ? " O pagamento já estava no SALIC: reenvie em Reservas para atualizar o PDF." : ""),
  };
}
