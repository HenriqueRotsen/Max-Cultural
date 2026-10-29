"use server";

import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { recomputeServiceStats, recomputeSupplierStats } from "@/lib/catalog/ratings";
import type { ActionState } from "@/lib/planning/action-state";
import { revalidatePlanning } from "@/lib/planning/server-utils";
import { revalidatePath } from "next/cache";

/** Reservas pagas pelo mesmo comprovante (uma NF dividida em várias rubricas). */
export async function siblingCommitmentIds(commitmentId: string): Promise<string[]> {
  const proofs = await prisma.documentRubricAllocation.findMany({
    where: { commitmentId, document: { kind: "PAYMENT_PROOF" } },
    select: { documentId: true },
  });
  if (proofs.length === 0) return [commitmentId];
  const all = await prisma.documentRubricAllocation.findMany({
    where: { documentId: { in: proofs.map((p) => p.documentId) } },
    select: { commitmentId: true },
  });
  return [...new Set([commitmentId, ...all.map((a) => a.commitmentId)])];
}

/**
 * Avaliação do fornecedor depois do pagamento: nota (1–5), prazo/atraso e comentário.
 * Vale para todas as contratações do mesmo pagamento e atualiza as médias no Fornecedores.
 */
export async function evaluateSupplier(
  commitmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();
  const { entitlements } = await getWorkspaceContext();
  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id: commitmentId, workspaceId: entitlements.workspaceId },
    select: { id: true, status: true, planningProjectId: true },
  });
  if (!commitment) return { error: "Reserva não encontrada." };
  if (commitment.status !== "PAID") {
    return { error: "A avaliação fica disponível depois que o pagamento é registrado." };
  }

  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Escolha uma nota de 1 a 5 estrelas." };
  }
  const onTime = String(formData.get("onTime") || "");
  if (onTime !== "sim" && onTime !== "nao") {
    return { error: "Informe se a entrega foi no prazo." };
  }
  const delayed = onTime === "nao";
  const delayDaysRaw = Number(formData.get("delayDays"));
  if (delayed && (!Number.isInteger(delayDaysRaw) || delayDaysRaw < 1 || delayDaysRaw > 3650)) {
    return { error: "Informe quantos dias de atraso (1 ou mais)." };
  }
  const comment = String(formData.get("comment") || "").trim().slice(0, 2000);

  const ids = await siblingCommitmentIds(commitment.id);
  const engagements = await prisma.catalogEngagement.findMany({
    where: { workspaceId: entitlements.workspaceId, commitment: { id: { in: ids } } },
    select: { id: true, serviceId: true, service: { select: { supplierId: true } } },
  });
  if (engagements.length === 0) return { error: "Contratação do fornecedor não encontrada." };

  await prisma.catalogEngagement.updateMany({
    where: { id: { in: engagements.map((e) => e.id) } },
    data: {
      rating,
      ratingComment: comment || null,
      delayed,
      delayDays: delayed ? delayDaysRaw : null,
      evaluatedAt: new Date(),
      evaluatedById: session.id,
    },
  });
  for (const serviceId of new Set(engagements.map((e) => e.serviceId))) {
    await recomputeServiceStats(serviceId);
  }
  for (const supplierId of new Set(engagements.map((e) => e.service.supplierId))) {
    await recomputeSupplierStats(supplierId);
  }
  await prisma.appNotification.deleteMany({
    where: {
      workspaceId: entitlements.workspaceId,
      type: "EVALUATION_PENDING",
      href: { in: ids.map((id) => `/planejamento/compromissos/${id}#avaliar`) },
    },
  });

  revalidatePlanning(commitment.planningProjectId);
  revalidatePath(`/planejamento/compromissos/${commitment.id}`);
  revalidatePath("/fornecedores");
  return { ok: true, message: "Avaliação registrada. Ela já aparece no Fornecedores." };
}
