import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  contasAPagarFilterLabels,
  filterAndSortContasAPagar,
  parseContasAPagarFilters,
  type ContasAPagarRow,
} from "@/lib/planning/contas-a-pagar";
import { formatRubricShortLabel } from "@/lib/planning/rubric-label";
import { renderContasAPagarReportHtml } from "@/lib/reports/contas-a-pagar-html";
import { htmlToPdf, reportFileStamp } from "@/lib/reports/pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const { entitlements } = await getWorkspaceContext();
    const filters = parseContasAPagarFilters(new URL(request.url).searchParams);

    const commitments = await prisma.rubricCommitment.findMany({
      where: {
        workspaceId: entitlements.workspaceId,
        status: "RESERVED",
      },
      include: {
        planningProject: { select: { id: true, externalCode: true, name: true } },
        budgetLine: {
          select: {
            itemName: true,
            stageName: true,
            productName: true,
            sortOrder: true,
          },
        },
        engagement: {
          include: {
            service: {
              include: { supplier: { select: { name: true, cnpj: true } } },
            },
          },
        },
        pedido: { select: { id: true } },
      },
      orderBy: [{ expectedPayAt: "asc" }, { createdAt: "asc" }],
    });

    const rows: ContasAPagarRow[] = commitments.map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      expectedPayAt: c.expectedPayAt.toISOString(),
      status: c.status,
      installmentNumber: c.installmentNumber,
      planningProjectId: c.planningProject.id,
      externalCode: c.planningProject.externalCode,
      projectName: c.planningProject.name,
      supplierName: c.engagement.service.supplier.name,
      supplierCnpj: c.engagement.service.supplier.cnpj,
      rubricLabel: formatRubricShortLabel(c.budgetLine),
      origin: c.pedido ? "pedido" : "reserva",
      pedidoId: c.pedido?.id ?? null,
    }));

    const filtered = filterAndSortContasAPagar(
      rows,
      filters,
      new Date(),
      // PDF usa a mesma janela padrão dos avisos quando não há prefs no request.
      Number(new URL(request.url).searchParams.get("days") || 5) || 5,
    );
    if (filtered.length === 0) {
      return NextResponse.json(
        { error: "Nenhum item para o relatório com os filtros atuais." },
        { status: 400 },
      );
    }

    const filterLabels = contasAPagarFilterLabels(filters).map((label) => {
      if (label !== "Projeto filtrado") return label;
      const sample =
        filtered[0] ||
        rows.find((r) => r.planningProjectId === filters.projectId);
      return sample
        ? `Projeto: ${sample.externalCode}`
        : label;
    });

    const html = await renderContasAPagarReportHtml({
      rows: filtered,
      filterLabels,
    });
    const pdf = await htmlToPdf(html);
    const filename = `max-origem-contas-a-pagar-${reportFileStamp()}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao gerar PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
