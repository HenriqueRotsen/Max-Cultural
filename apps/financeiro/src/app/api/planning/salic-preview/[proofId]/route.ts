import { NextResponse } from "next/server";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSalicPackagePreviewBytes } from "@/lib/planning/federal/salic-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ proofId: string }> },
) {
  try {
    const { proofId } = await context.params;
    await requireUser();
    const { entitlements } = await getWorkspaceContext();

    const proof = await prisma.planningDocument.findFirst({
      where: {
        id: proofId,
        workspaceId: entitlements.workspaceId,
        kind: "PAYMENT_PROOF",
        status: "IMPORTED",
        planningProjectId: { not: null },
      },
      select: { planningProjectId: true },
    });
    if (!proof?.planningProjectId) {
      return NextResponse.json({ error: "Comprovante não encontrado" }, { status: 404 });
    }

    const { body, filename } = await getSalicPackagePreviewBytes(
      proof.planningProjectId,
      proofId,
    );

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set(
      "Content-Disposition",
      `inline; filename="${filename.replace(/"/g, "")}"`,
    );
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    headers.set("Content-Length", String(body.length));

    return new NextResponse(new Uint8Array(body), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("não encontrado") || message.includes("não está pronto")
      ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
