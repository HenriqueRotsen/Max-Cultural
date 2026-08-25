import { readFile } from "fs/promises";
import { access } from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveMimeType(doc: { mimeType: string; filename: string; storagePath: string }) {
  const name = doc.filename.toLowerCase();
  const stored = doc.storagePath.toLowerCase();
  if (doc.mimeType && doc.mimeType !== "application/octet-stream") return doc.mimeType;
  if (name.endsWith(".pdf") || stored.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".xml") || stored.endsWith(".xml")) return "application/xml";
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) {
    const ext = name.split(".").pop()!;
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    return `image/${ext === "jpg" ? "jpeg" : ext}`;
  }
  return doc.mimeType || "application/octet-stream";
}

async function loadDocument(id: string) {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();
  return prisma.planningDocument.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const doc = await loadDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
    }

    try {
      await access(doc.storagePath);
    } catch {
      return NextResponse.json({ error: "Arquivo ausente no disco" }, { status: 404 });
    }

    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    const isGz = doc.storagePath.endsWith(".gz");
    const filename = doc.filename || "documento";
    const mimeType = resolveMimeType(doc);

    const raw = await readFile(doc.storagePath);
    const body = isGz ? (await import("zlib")).gunzipSync(raw) : raw;

    const headers = new Headers();
    headers.set("Content-Type", mimeType);
    headers.set(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${filename.replace(/"/g, "")}"`,
    );
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    headers.set("Content-Length", String(body.length));

    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
