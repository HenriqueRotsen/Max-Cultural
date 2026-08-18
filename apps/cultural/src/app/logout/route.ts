import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  await clearSessionCookie();
  if (user) {
    await writeAuditLog({ actorUserId: user.id, action: "auth.logout" });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

