import type { PermissionCode } from "@/lib/permission-catalog";

/** Destino inicial no Fluxo conforme o que a pessoa pode ver. */
export function fluxoHomePath(perms: Set<PermissionCode> | Iterable<string>): string {
  const set = perms instanceof Set ? perms : new Set(perms);
  if (set.has("inscricoes:read")) return "/dashboard";
  if (set.has("formularios:review") || set.has("formularios:write")) {
    return "/dashboard/formularios";
  }
  return "/dashboard";
}
