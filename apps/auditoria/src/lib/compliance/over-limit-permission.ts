import { ACCESS_RESTRICTION_IDS } from "@max/auth";

type Perms = { ids: Set<string>; fetchFailed?: boolean };

/**
 * Restrição do hub: quem a tem não vê os PRONACs “acima do limite” (linha vermelha
 * no Por PRONAC). É uma restrição, não um acesso: ninguém a tem por padrão e o
 * superadmin (`*`) nunca é afetado.
 */
export const HIDE_OVER_LIMIT_PERMISSION: (typeof ACCESS_RESTRICTION_IDS)[number] =
  "auditoria.restricoes.ocultar_acima_limite";

/** Se a lista de permissões não carregou, esconde (falha fechada) — exceto superadmin. */
export function isHidingOverLimit(perms: Perms) {
  if (perms.ids.has("*")) return false;
  if (perms.fetchFailed) return true;
  return perms.ids.has(HIDE_OVER_LIMIT_PERMISSION);
}
