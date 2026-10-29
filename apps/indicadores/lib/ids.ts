import { prisma } from "@/lib/prisma";

function maxNumericId(values: string[]): number {
  let max = 0;
  for (const v of values) {
    const t = String(v ?? "").trim();
    if (!/^\d+$/.test(t)) continue;
    const n = Number.parseInt(t, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export async function nextIdProjeto(): Promise<string> {
  const rows = await prisma.projeto.findMany({ select: { id: true } });
  return String(maxNumericId(rows.map((r) => r.id)) + 1);
}

export async function nextIdOficina(): Promise<string> {
  const rows = await prisma.oficina.findMany({ select: { id: true } });
  return String(maxNumericId(rows.map((r) => r.id)) + 1);
}
