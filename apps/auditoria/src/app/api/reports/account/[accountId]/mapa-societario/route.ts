import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { corporateMapCopy } from "@/lib/corporate/copy";
import { renderProponentCorporateMapHtml } from "@/lib/reports/html";
import { htmlToPdf, reportFileStamp } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = Promise<{ accountId: string }>;

export async function GET(_request: Request, context: { params: Params }) {
  try {
    const { accountId } = await context.params;
    const { entitlements } = await getWorkspaceContext();
    const ws = entitlements.workspaceId;

    const account = await prisma.salicAccount.findFirst({
      where: { id: accountId, workspaceId: ws },
      include: {
        corporatePeriods: {
          orderBy: { validFrom: "desc" },
          include: { members: { orderBy: { name: "asc" } } },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Proponente não encontrado" },
        { status: 404 },
      );
    }

    const html = await renderProponentCorporateMapHtml({
      proponentName: account.name,
      proponentCgccpf: account.cgccpf,
      foundedAt: account.foundedAt,
      foundedAtPrecision: account.foundedAtPrecision,
      foundedAtSource: account.foundedAtSource,
      institutionalMap: account.institutionalMap,
      periods: account.corporatePeriods.map((p) => ({
        label: p.label,
        source: p.source,
        validFrom: p.validFrom,
        validFromPrecision: p.validFromPrecision,
        validTo: p.validTo,
        validToPrecision: p.validToPrecision,
        members: p.members.map((m) => ({
          name: m.name,
          cgccpf: m.cgccpf,
          personType: m.personType,
          role: m.role,
          source: m.source,
        })),
      })),
    });

    const pdf = await htmlToPdf(html);
    const safeName =
      account.cgccpf.replace(/\D/g, "") || accountId.slice(0, 8);
    const copy = corporateMapCopy(account.institutionalMap);
    const filename = `${copy.pdfFilenamePrefix}-${safeName}-${reportFileStamp()}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
