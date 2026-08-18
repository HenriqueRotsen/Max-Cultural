import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import {
  compareSheetToSystem,
  normalizeInKey,
  parseProjectsWorkbook,
  type SystemProjectRow,
} from "@/lib/compare/projects-sheet";
import { parseCaps } from "@/lib/compliance/rules";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const workspaceId = entitlements.workspaceId;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie um arquivo .xlsx" }, { status: 400 });
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Formato inválido. Use planilha Excel (.xlsx)." },
        { status: 400 },
      );
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo maior que 8 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sheetRows = parseProjectsWorkbook(buffer);

    const projects = await prisma.project.findMany({
      where: { salicAccount: { workspaceId } },
      select: {
        id: true,
        pronac: true,
        name: true,
        valorCaptado: true,
        salicAccount: { select: { name: true } },
        complianceRuleset: {
          select: {
            sourceCode: true,
            caps: true,
          },
        },
        payments: { select: { amount: true } },
      },
      orderBy: { pronac: "asc" },
    });

    const systemRows: SystemProjectRow[] = projects.map((p) => {
      const paidTotal = p.payments.reduce((s, x) => s + Number(x.amount), 0);
      const sourceCode = p.complianceRuleset?.sourceCode || null;
      const caps = p.complianceRuleset ? parseCaps(p.complianceRuleset.caps) : null;
      return {
        id: p.id,
        pronac: p.pronac.replace(/\D/g, "") || p.pronac,
        name: p.name,
        accountName: p.salicAccount.name,
        valorCaptado: p.valorCaptado != null ? Number(p.valorCaptado) : null,
        sourceCode,
        inKey: normalizeInKey(sourceCode),
        supplierCapPct: caps?.supplierCapPct ?? null,
        proponentCapPct: caps?.proponentCapPct ?? null,
        paidTotal,
      };
    });

    const result = compareSheetToSystem(sheetRows, systemRows);
    return NextResponse.json({
      fileName: file.name,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
