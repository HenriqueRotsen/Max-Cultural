import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

/**
 * Validação leve de sessão (HMAC + sessionVersion no banco).
 * Usado por Origem/Fluxo para invalidar cookie quando o admin
 * altera papel/permissões (sessionVersion++).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    userId: user.id,
    sessionVersion: user.sessionVersion,
  });
}
