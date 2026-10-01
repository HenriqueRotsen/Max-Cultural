import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  try {
    const user = await getSessionUser();
    userId = user?.id ?? null;
  } catch {
    // Sessão inválida/expirada — segue limpando o cookie
  }

  try {
    await clearSessionCookie();
  } catch {
    // ignore
  }

  if (userId) {
    try {
      await writeAuditLog({ actorUserId: userId, action: "auth.logout" });
    } catch {
      // logout não deve falhar por auditoria
    }
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
