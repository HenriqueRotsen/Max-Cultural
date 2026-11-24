import { applyPermissionOverrides, grantedIdsFromRoleRows, normalizeGrantedIds } from "@max/auth";
import { prisma } from "@/lib/db";
import { canEnterAuditoria } from "@/lib/auth/hub-permissions";

export type HubUserAccessRow = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  rolePermissions: Array<{ screen: string; canView: boolean; canEdit: boolean }> | null;
  overrides: Array<{ screen: string; effect: "GRANT" | "DENY" }> | null;
};

/** Mesma conta do hub (MAX Cultural): papel + GRANT/DENY por pessoa; superadmin entra em tudo. */
export function hubUserCanEnterAuditoria(u: HubUserAccessRow): boolean {
  if (u.isSuperAdmin) return true;
  const fromRole = grantedIdsFromRoleRows(u.rolePermissions ?? []);
  const granted = new Set(normalizeGrantedIds(applyPermissionOverrides(fromRole, u.overrides ?? [])));
  return canEnterAuditoria(granted);
}

/**
 * E-mails de quem entra na Auditoria hoje (usuários ativos do hub com
 * `auditoria.app` ou `financeiro.auditoria`). `null` se o hub não puder ser lido.
 */
export async function listAuditoriaUserEmails(): Promise<string[] | null> {
  try {
    const rows = await prisma.$queryRaw<HubUserAccessRow[]>`
      select u.id,
             u.email,
             u."isSuperAdmin",
             (select json_agg(json_build_object('screen', rp.screen, 'canView', rp."canView", 'canEdit', rp."canEdit"))
                from public.role_permissions rp where rp."roleId" = u."roleId") as "rolePermissions",
             (select json_agg(json_build_object('screen', up.screen, 'effect', up.effect))
                from public.user_permissions up where up."userId" = u.id) as overrides
        from public.users u
       where u."deactivatedAt" is null`;
    return [
      ...new Set(rows.filter(hubUserCanEnterAuditoria).map((u) => u.email.trim().toLowerCase()).filter(Boolean)),
    ];
  } catch (e) {
    console.error("[alertas] não consegui ler os usuários do hub", e);
    return null;
  }
}
