import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  PENDING_2FA_COOKIE,
  clearAuthCookieOptions,
  isPrefetchRequest,
} from "@max/auth";
import { getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  let userId: string | null = null;
  try {
    const user = await getSessionUser();
    userId = user?.id ?? null;
  } catch {
    // Sessão inválida/expirada — segue limpando o cookie
  }

  if (userId) {
    try {
      await writeAuditLog({ actorUserId: userId, action: "auth.logout" });
    } catch {
      // logout não deve falhar por auditoria
    }
  }

  const res = NextResponse.redirect(new URL("/login", request.url));
  res.headers.set("cache-control", "no-store");
  for (const opts of clearAuthCookieOptions()) {
    res.cookies.set(AUTH_COOKIE, "", opts);
    res.cookies.set(PENDING_2FA_COOKIE, "", opts);
  }
  return res;
}
