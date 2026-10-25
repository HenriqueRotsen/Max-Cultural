import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const run = await prisma.syncRun.findUnique({
      where: { id },
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    });
    if (!run) {
      return NextResponse.json({ error: "Sync não encontrado" }, { status: 404 });
    }
    return NextResponse.json(run);
  }

  const [active, recent] = await Promise.all([
    prisma.syncRun.findFirst({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { createdAt: "desc" },
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    }),
    prisma.syncRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { salicAccount: { select: { name: true, cgccpf: true } } },
    }),
  ]);

  return NextResponse.json({ active, recent });
}
