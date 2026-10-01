import { NextResponse } from "next/server";
import { getSessionUser, listGrantedPermissionIds } from "@/lib/auth";
import { ACCESS_BY_ID } from "@max/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const permissions = listGrantedPermissionIds(user);
  return NextResponse.json({
    permissions,
    /** Compat temporária com clientes que leem screen/canView/canEdit. */
    entries: permissions.map((id) => {
      const entry = ACCESS_BY_ID[id];
      return {
        screen: id,
        canView: true,
        canEdit:
          entry?.kind === "capability" ||
          id.endsWith(".edit") ||
          Boolean(user.role.permissions.find((p) => p.screen === id)?.canEdit),
      };
    }),
  });
}
