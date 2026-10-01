import { requireUser } from "@/lib/auth/session";
import { hasHubPermission } from "@/lib/auth/hub-permissions";

/**
 * Permissões do hub MAX Cultural para Planejamento.
 * Deny-by-default: hub indisponível ou sem grant → false (sem fallback ADMIN).
 */
async function canHubScreen(permissionId: string): Promise<boolean> {
  await requireUser();
  return hasHubPermission(permissionId);
}

export async function canAccessOrigemApp(): Promise<boolean> {
  return canHubScreen("origem.app");
}

export async function canAccessPlanejamento(): Promise<boolean> {
  return canHubScreen("origem.planejamento");
}

export async function canExceedRubric(): Promise<boolean> {
  return canHubScreen("origem.planejamento.exceder_rubrica");
}

export async function canEditRubricas(): Promise<boolean> {
  return canHubScreen("origem.planejamento.editar_rubricas");
}

export async function canPublishToSalic(): Promise<boolean> {
  return canHubScreen("origem.planejamento.subir_salic");
}

export async function canReadequacao(): Promise<boolean> {
  return canHubScreen("origem.planejamento.readequacao");
}

export async function canDeleteNf(): Promise<boolean> {
  return canHubScreen("origem.planejamento.excluir_nf");
}
