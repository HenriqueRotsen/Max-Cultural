import { NextResponse } from "next/server";
import { getSupplierDetail } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { renderSupplierDetailHtml } from "@/lib/reports/html";
import { htmlToPdf, reportFileStamp } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = Promise<{ supplierId: string }>;

export async function GET(request: Request, context: { params: Params }) {
  try {
    const { supplierId } = await context.params;
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId") || undefined;
    const pronac = url.searchParams.get("pronac") || undefined;

    const [detail, account] = await Promise.all([
      getSupplierDetail(supplierId, { accountId, pronac }),
      accountId
        ? prisma.salicAccount.findUnique({ where: { id: accountId } })
        : Promise.resolve(null),
    ]);

    const html = await renderSupplierDetailHtml({
      filters: {
        accountName: account?.name || null,
        pronac: pronac || null,
      },
      supplierName: detail.supplier.name,
      supplierCgccpf: detail.supplier.cgccpf,
      total: detail.total,
      paymentCount: detail.payments.length,
      byPronac: detail.byPronac,
      byAccount: detail.byAccount,
      payments: detail.payments.map((p) => ({
        paymentDate: p.paymentDate,
        pronac: p.project.pronac,
        accountName: p.project.salicAccount.name,
        itemName: p.itemName,
        amount: Number(p.amount),
        documentType: p.documentType,
        documentNumber: p.documentNumber,
      })),
    });

    const pdf = await htmlToPdf(html);
    const safeName = detail.supplier.cgccpf.replace(/\D/g, "") || supplierId.slice(0, 8);
    const filename = `salink-fornecedor-${safeName}-${reportFileStamp()}.pdf`;

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
