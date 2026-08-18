import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cancela sync pending/running (libera a fila se travou). */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      syncRunId?: string;
      all?: boolean;
    };

    const activeStatuses = ["pending", "running"] as ("pending" | "running")[];
    const where = body.syncRunId
      ? { id: body.syncRunId, status: { in: activeStatuses } }
      : body.all
        ? { status: { in: activeStatuses } }
        : null;

    if (!where) {
      return NextResponse.json(
        { error: "Informe syncRunId ou all: true" },
        { status: 400 },
      );
    }

    const result = await prisma.syncRun.updateMany({
      where,
      data: {
        status: "error",
        finishedAt: new Date(),
        errorMessage: "Cancelada pelo usuário",
        progressMessage: "Cancelada",
        workState: Prisma.DbNull,
      },
    });

    if (result.count === 0 && body.syncRunId) {
      const run = await prisma.syncRun.findUnique({ where: { id: body.syncRunId } });
      if (!run) {
        return NextResponse.json({ error: "Atualização não encontrada" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, status: run.status, cancelled: 0 });
    }

    return NextResponse.json({ ok: true, cancelled: result.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
