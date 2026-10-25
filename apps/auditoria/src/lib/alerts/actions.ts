"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";

async function ownAlert(id: string) {
  const { session, entitlements } = await getWorkspaceContext();
  const alert = await prisma.auditAlert.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, status: true },
  });
  return { alert, userId: session?.id ?? null };
}

function refresh(id: string) {
  revalidatePath("/alertas");
  revalidatePath(`/alertas/${id}`);
  revalidatePath("/inicio");
}

export async function markAlertSeen(id: string) {
  const { alert, userId } = await ownAlert(id);
  if (!alert || alert.status !== "NOVO") return;
  await prisma.auditAlert.update({
    where: { id },
    data: { status: "VISTO", seenAt: new Date(), seenById: userId },
  });
  refresh(id);
}

export async function resolveAlert(id: string, formData: FormData) {
  const { alert, userId } = await ownAlert(id);
  if (!alert || alert.status === "RESOLVIDO") return;
  const note = String(formData.get("note") || "").trim().slice(0, 2000);
  const now = new Date();
  await prisma.auditAlert.update({
    where: { id },
    data: {
      status: "RESOLVIDO",
      resolvedAt: now,
      resolvedById: userId,
      resolutionNote: note || null,
      ...(alert.status === "NOVO" ? { seenAt: now, seenById: userId } : {}),
    },
  });
  refresh(id);
}

export async function reopenAlert(id: string) {
  const { alert } = await ownAlert(id);
  if (!alert || alert.status !== "RESOLVIDO") return;
  await prisma.auditAlert.update({
    where: { id },
    data: { status: "VISTO", resolvedAt: null, resolvedById: null },
  });
  refresh(id);
}
