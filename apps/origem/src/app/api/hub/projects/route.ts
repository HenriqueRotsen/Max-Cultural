import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@max/auth";
import {
  listHubProjectSummaries,
  resolveWorkspaceIdForHubApi,
} from "@/lib/hub/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("x-max-session")?.trim();
  if (header) return header;

  const cookie = request.headers.get("cookie") || "";
  const parts = cookie.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${AUTH_COOKIE}=`)) {
      // Não usar decodeURIComponent no token inteiro — o e-mail no payload já vem
      // percent-encoded e faz parte da assinatura HMAC.
      return part.slice(AUTH_COOKIE.length + 1);
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const token = sessionTokenFromRequest(request);
    const workspaceId = await resolveWorkspaceIdForHubApi(token);
    if (!workspaceId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const projects = await listHubProjectSummaries(workspaceId);
    return NextResponse.json({ projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
