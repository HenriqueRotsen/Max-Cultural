import { NextResponse } from "next/server";
import {
  getPronacPanorama,
  getWatchedSupplierCount,
  listWatchedSuppliers,
} from "@/lib/audit";
import { loadComplianceBundle, metaForAccount } from "@/lib/compliance/context";
import { prisma } from "@/lib/db";
import { renderPronacOverviewHtml } from "@/lib/reports/html";
import { htmlToPdf, reportFileStamp } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseFilters(url: URL) {
  const accountId = url.searchParams.get("accountId") || undefined;
  const pronac = url.searchParams.get("pronac") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const rulesetVersion = url.searchParams.get("rulesetVersion") || undefined;
  const watchedOnlyParam = url.searchParams.get("watchedOnly");
  return { accountId, pronac, from, to, rulesetVersion, watchedOnlyParam };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { accountId, pronac, from, to, rulesetVersion, watchedOnlyParam } =
      parseFilters(url);
    const watchedCount = await getWatchedSupplierCount();
    const watchedOnly =
      watchedOnlyParam === "1" ||
      watchedOnlyParam === "on" ||
      (watchedOnlyParam !== "0" && watchedCount > 0);

    const [rows, account, watchedSuppliers] = await Promise.all([
      getPronacPanorama({ accountId, pronac, from, to, rulesetVersion, watchedOnly }),
      accountId
        ? prisma.salicAccount.findUnique({ where: { id: accountId } })
        : Promise.resolve(null),
      listWatchedSuppliers(),
    ]);

    const bundle = await loadComplianceBundle(
      accountId ? [accountId] : [...new Set(rows.map((r) => r.accountId))],
    );

    const html = await renderPronacOverviewHtml({
      filters: {
        accountName: account?.name || null,
        pronac: pronac || null,
        from: from || null,
        to: to || null,
        watchedOnly,
        watchedCount,
      },
      rules: bundle.rules,
      watchedSuppliers,
      rows: rows.map((row) => {
        const meta = metaForAccount(bundle, row.accountId, row.rules.version);
        return {
          ...row,
          personType: meta.personType || row.personType,
          relatedParties: meta.relatedParties,
          rules: row.rules,
          rulesetSourceCode: row.rulesetSourceCode,
        };
      }),
    });

    const pdf = await htmlToPdf(html);
    const filename = `max-origem-pronacs-${reportFileStamp()}.pdf`;

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
