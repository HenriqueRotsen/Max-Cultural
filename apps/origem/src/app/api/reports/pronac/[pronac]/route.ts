import { getWorkspaceContext } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import {
  getPronacDetail,
  getWatchedSupplierCount,
  listWatchedSuppliers,
} from "@/lib/audit";
import { loadComplianceBundle, metaForAccount } from "@/lib/compliance/context";
import { rulesForProject } from "@/lib/compliance/rules";
import { prisma } from "@/lib/db";
import { renderPronacDetailHtml } from "@/lib/reports/html";
import { htmlToPdf, reportFileStamp } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = Promise<{ pronac: string }>;

export async function GET(
  request: Request,
  context: { params: Params },
) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const workspaceId = entitlements.workspaceId;
    const { pronac } = await context.params;
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId") || undefined;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const watchedOnlyParam = url.searchParams.get("watchedOnly");
    const watchedCount = await getWatchedSupplierCount(workspaceId);
    const watchedOnly =
      watchedOnlyParam === "1" ||
      watchedOnlyParam === "on" ||
      (watchedOnlyParam !== "0" && watchedCount > 0);

    const [detail, account, watchedSuppliers] = await Promise.all([
      getPronacDetail(pronac, { accountId, from, to, watchedOnly, workspaceId }),
      accountId
        ? prisma.salicAccount.findUnique({ where: { id: accountId } })
        : Promise.resolve(null),
      listWatchedSuppliers(workspaceId),
    ]);

    const primaryAccountId = accountId || detail.accounts[0]?.id;
    const rules = await rulesForProject({
      complianceRulesetId: detail.compliance?.rulesetId,
    });
    const bundle = await loadComplianceBundle(
      primaryAccountId ? [primaryAccountId] : detail.accounts.map((a) => a.id),
      { workspaceId },
    );
    const meta = metaForAccount(bundle, primaryAccountId, rules.version);

    const html = await renderPronacDetailHtml({
      filters: {
        accountName: account?.name || detail.accounts[0]?.name || null,
        pronac,
        from: from || null,
        to: to || null,
        watchedOnly,
        watchedCount,
      },
      rules,
      personType: meta.personType || detail.accounts[0]?.personType,
      relatedParties: meta.relatedParties,
      watchedSuppliers: watchedSuppliers.filter((w) => {
        const dig = (w.cgccpf || "").replace(/\D/g, "");
        return (
          dig.length >= 11 &&
          detail.allSuppliers.some((s) => s.cgccpf.replace(/\D/g, "") === dig)
        );
      }),
      pronac: detail.pronac,
      name: detail.name,
      accountName: account?.name || detail.accounts[0]?.name || null,
      accountCgccpf: account?.cgccpf || detail.accounts[0]?.cgccpf || null,
      projectTotal: detail.projectTotal,
      paidTotal: detail.paidTotal,
      total: detail.total,
      paymentCount: detail.paymentCount,
      supplierCount: detail.supplierCount,
      watchedOnly: detail.watchedOnly,
      suppliers: detail.suppliers,
      allSuppliers: detail.allSuppliers,
      bondSuppliers: detail.bondSuppliers,
      payments: detail.payments.map((p) => ({
        paymentDate: p.paymentDate,
        supplierName: p.supplier.name,
        itemName: p.itemName,
        amount: Number(p.amount),
        documentType: p.documentType,
        documentNumber: p.documentNumber,
        source: p.source,
      })),
    });

    const pdf = await htmlToPdf(html);
    const filename = `salink-pronac-${pronac}-${reportFileStamp()}.pdf`;

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
