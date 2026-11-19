import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { hiddenProjectIds } from "@/lib/compliance/over-limit-visibility";
import { matchesPronacSearch, pronacSearchHay } from "@/lib/pronac-search";
import { renderSituacaoReportHtml } from "@/lib/reports/html";
import { htmlToPdf, reportFileStamp } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Relatório "Situação no SALIC": os projetos do espaço (com ou sem pagamento),
 * com a mesma busca da aba Por PRONAC (`q`) e o proponente (`accountId`).
 */
export async function GET(request: Request) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const workspaceId = entitlements.workspaceId;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
    const accountId = url.searchParams.get("accountId") || undefined;

    const hidden = await hiddenProjectIds();
    const [projects, account] = await Promise.all([
      prisma.project.findMany({
        where: {
          salicAccount: { workspaceId },
          ...(accountId ? { salicAccountId: accountId } : {}),
          ...(hidden.length ? { id: { notIn: hidden } } : {}),
        },
        select: {
          pronac: true,
          name: true,
          situacao: true,
          lastSyncedAt: true,
          salicAccount: { select: { name: true } },
        },
        orderBy: { pronac: "asc" },
      }),
      accountId
        ? prisma.salicAccount.findFirst({ where: { id: accountId, workspaceId }, select: { name: true } })
        : Promise.resolve(null),
    ]);

    // O mesmo PRONAC pode estar em mais de uma conta: uma linha por PRONAC.
    const seen = new Set<string>();
    const rows = projects
      .map((p) => ({
        pronac: p.pronac,
        name: p.name,
        accountName: p.salicAccount.name,
        situacao: p.situacao,
        lastSyncedAt: p.lastSyncedAt ? p.lastSyncedAt.toISOString() : null,
      }))
      .filter((r) => matchesPronacSearch(pronacSearchHay(r), q))
      .filter((r) => (seen.has(r.pronac) ? false : (seen.add(r.pronac), true)));

    const html = await renderSituacaoReportHtml({
      rows,
      query: q || null,
      accountName: account?.name ?? null,
    });
    const pdf = await htmlToPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="max-auditoria-situacao-${reportFileStamp()}.pdf"`,
      },
    });
  } catch (e) {
    console.error("[relatorio situacao]", e);
    const message = e instanceof Error ? e.message : "Falha ao gerar relatório";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
