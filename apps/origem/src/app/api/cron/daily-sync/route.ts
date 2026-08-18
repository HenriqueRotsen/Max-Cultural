import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDailySyncAllAccounts } from "@/lib/sync/daily";

export const runtime = "nodejs";
/** Vercel Pro: até 300s; sync completo pode precisar de worker local/cron script. */
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = new URL(request.url).searchParams.get("secret") || "";
  return bearer === secret || query === secret;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const running = await prisma.syncRun.findFirst({
    where: { status: { in: ["pending", "running"] } },
  });
  if (running) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Já existe sincronização em andamento",
        syncRunId: running.id,
      },
      { status: 409 },
    );
  }

  try {
    const result = await runDailySyncAllAccounts();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
