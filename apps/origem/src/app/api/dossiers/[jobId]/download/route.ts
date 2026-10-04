import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  createSignedDownloadUrl,
  downloadStorageBytes,
  uploadZipBytes,
} from "@/lib/dossier/storage";
import { accountAggregateZipPath } from "@/lib/dossier/paths";
import { createZipFromFiles } from "@/lib/dossier/zip";
import { mkdir, readFile, rm } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = Promise<{ jobId: string }>;

/**
 * URL assinada do ZIP do dossiê.
 * Multi-PRONAC: devolve o ZIP agregado (gera sob demanda se ainda não existir).
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
      zips?: Array<{ zipPath: string; pronac: string; zipStoredBytes?: number }>;
      aggregateZipPath?: string | null;
    } | null;
    const zips = manifest?.zips || [];
    const allowed = new Set(
      zips
        .map((z) => z.zipPath)
        .concat(job.zipPath ? [job.zipPath] : [])
        .concat(manifest?.aggregateZipPath ? [manifest.aggregateZipPath] : []),
    );

    // Pedido explícito de um ZIP de PRONAC (uso avançado).
    if (requestedPath) {
      if (!allowed.has(requestedPath) || !requestedPath.startsWith(job.storagePrefix)) {
        return NextResponse.json({ error: "ZIP inválido para este job" }, { status: 400 });
      }
      const signedUrl = await createSignedDownloadUrl(requestedPath, 3600);
      return NextResponse.json({ url: signedUrl, zipPath: requestedPath });
    }

    let zipPath =
      job.zipPath ||
      manifest?.aggregateZipPath ||
      (zips.length === 1 ? zips[0]!.zipPath : undefined);

    // Multi-PRONAC sem agregado: monta sob demanda e grava.
    if (!zipPath && zips.length > 1) {
      const aggregatePath = accountAggregateZipPath(job.workspaceId, job.accountId);
      const tmpDir = path.join("/tmp", `dossier-dl-${jobId}`);
      await mkdir(tmpDir, { recursive: true });
      const tmpZip = path.join(tmpDir, "dossie-completo.zip");
      const files = [];
      for (const z of zips) {
        files.push({
          relativePath: path.basename(z.zipPath),
          buffer: await downloadStorageBytes(z.zipPath),
        });
      }
      const { byteSize } = await createZipFromFiles({ outPath: tmpZip, files });
      const buf = await readFile(tmpZip);
      await uploadZipBytes(aggregatePath, buf);
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);

      zipPath = aggregatePath;
      await prisma.legalDossierJob.update({
        where: { id: job.id },
        data: {
          zipPath,
          manifestJson: {
            ...(manifest || {}),
            aggregateZipPath: zipPath,
            aggregateBytes: byteSize,
          },
        },
      });
    }

    if (!zipPath) {
      return NextResponse.json({ error: "Nenhum ZIP disponível neste job" }, { status: 400 });
    }
    if (!zipPath.startsWith(job.storagePrefix)) {
      return NextResponse.json({ error: "ZIP inválido para este job" }, { status: 400 });
    }

    const signedUrl = await createSignedDownloadUrl(zipPath, 3600);
    return NextResponse.json({ url: signedUrl, zipPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
