import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createSignedDownloadUrl } from "@/lib/dossier/storage";

export const runtime = "nodejs";

type Params = Promise<{ jobId: string }>;

/**
 * URL assinada do ZIP.
 * Query `zipPath` opcional (multi-PRONAC); senão usa job.zipPath ou o único zip do manifesto.
 */
export async function GET(request: Request, context: { params: Params }) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const { jobId } = await context.params;
    const url = new URL(request.url);
    const requestedPath = url.searchParams.get("zipPath") || undefined;

    const job = await prisma.legalDossierJob.findFirst({
      where: { id: jobId, workspaceId: entitlements.workspaceId },
    });
    if (!job) {
      return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
    }
    if (job.status !== "success") {
      return NextResponse.json(
        { error: "Dossiê ainda não concluído" },
        { status: 400 },
      );
    }

    const manifest = job.manifestJson as {
      zips?: Array<{ zipPath: string; pronac: string }>;
    } | null;
    const allowed = new Set(
      (manifest?.zips || []).map((z) => z.zipPath).concat(job.zipPath ? [job.zipPath] : []),
    );

    let zipPath = requestedPath || job.zipPath || undefined;
    if (!zipPath && manifest?.zips?.length === 1) {
      zipPath = manifest.zips[0]!.zipPath;
    }
    if (!zipPath) {
      return NextResponse.json(
        {
          error: "Informe zipPath (há vários ZIPs neste job)",
          zips: manifest?.zips ?? [],
        },
        { status: 400 },
      );
    }
    if (!allowed.has(zipPath) || !zipPath.startsWith(job.storagePrefix)) {
      return NextResponse.json({ error: "ZIP inválido para este job" }, { status: 400 });
    }

    const signedUrl = await createSignedDownloadUrl(zipPath, 3600);
    return NextResponse.json({ url: signedUrl, zipPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
