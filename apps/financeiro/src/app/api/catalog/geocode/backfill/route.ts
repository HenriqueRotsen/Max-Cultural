import { NextResponse } from "next/server";
import { backfillCatalogAddresses } from "@/lib/catalog/geo";
import { getWorkspaceContext } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const { entitlements } = await getWorkspaceContext();
    const result = await backfillCatalogAddresses(entitlements.workspaceId, {
      limit: 5,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
}
