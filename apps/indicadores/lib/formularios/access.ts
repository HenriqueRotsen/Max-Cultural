import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";
import type { PermissionCode } from "@/lib/permission-catalog";

export async function isAcaoResponsavel(
  userId: string,
  acaoId: string,
): Promise<boolean> {
  const row = await prisma.acaoResponsavel.findUnique({
    where: {
      acaoId_userId: { acaoId, userId },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function listProfessorAcaoIds(userId: string): Promise<string[]> {
  const rows = await prisma.acaoResponsavel.findMany({
    where: { userId },
    select: { acaoId: true },
  });
  return rows.map((r) => r.acaoId);
}

export async function canReviewFormulario(
  user: SessionUser,
  acaoId: string,
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const perms = await getEffectivePermissions(user.id);
  if (!perms.has("formularios:review")) return false;
  return isAcaoResponsavel(user.id, acaoId);
}

/** Professor de ação sem write/merge — edição limitada na fila. */
export function isProfessorOnlyMode(
  user: SessionUser,
  perms: Set<PermissionCode>,
): boolean {
  if (user.isSuperAdmin) return false;
  if (perms.has("formularios:write") || perms.has("formularios:merge")) {
    return false;
  }
  return perms.has("formularios:review");
}

export function campoOcultoParaProfessor(
  config: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(config && config.ocultoProfessor === true);
}

/** CPF marcado como oculto ao professor (coluna dedicada ou campo tipo CPF). */
export function cpfOcultoParaProfessor(
  campos: Array<{
    tipo?: string;
    sigaColumn?: string | null;
    rotulo?: string;
    config: Record<string, unknown> | null;
  }>,
): boolean {
  return campos.some((c) => {
    if (!campoOcultoParaProfessor(c.config)) return false;
    if (c.tipo === "CPF" || c.sigaColumn === "CPF") return true;
    return Boolean(c.rotulo?.toLowerCase().includes("cpf"));
  });
}

/** Remove respostas de campos marcados como ocultos ao professor (não apaga no banco). */
export function redactPayloadForProfessor(
  payload: {
    answers?: Record<string, unknown>;
    sigaPartial?: Record<string, unknown>;
  },
  campos: Array<{
    id: string;
    sigaColumn: string | null;
    config: Record<string, unknown> | null;
  }>,
): {
  answers?: Record<string, unknown>;
  sigaPartial?: Record<string, unknown>;
} {
  const hiddenIds = new Set<string>();
  const hiddenSiga = new Set<string>();
  for (const c of campos) {
    if (!campoOcultoParaProfessor(c.config)) continue;
    hiddenIds.add(c.id);
    if (c.sigaColumn) hiddenSiga.add(c.sigaColumn);
  }
  if (hiddenIds.size === 0 && hiddenSiga.size === 0) return payload;

  const answers = { ...(payload.answers ?? {}) };
  for (const id of hiddenIds) delete answers[id];
  const sigaPartial = { ...(payload.sigaPartial ?? {}) };
  for (const col of hiddenSiga) delete sigaPartial[col];
  return { answers, sigaPartial };
}
