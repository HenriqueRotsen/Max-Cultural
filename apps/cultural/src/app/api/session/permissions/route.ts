import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    permissions: user.role.permissions.map((p) => ({
      screen: p.screen,
      canView: p.canView,
      canEdit: p.canEdit,
    })),
  });
}
