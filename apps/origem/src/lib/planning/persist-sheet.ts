import { prisma } from "@/lib/db";
import type { HomologatedLine } from "@/lib/planning/homologada";

/** Persiste planilha homologada (SALIC ou arquivo estadual) no planejamento. */
export async function persistHomologatedSheet(params: {
  planningProjectId: string;
  lines: HomologatedLine[];
  totalApproved: number;
  sourceFilename?: string | null;
  importSource: "SALIC_HOMOLOGADA" | "STATE_FILE" | "SALIC_READEQUADA";
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.projectBudgetSheet.findUnique({
      where: { planningProjectId: params.planningProjectId },
    });
    if (existing) {
      await tx.projectBudgetLine.deleteMany({ where: { sheetId: existing.id } });
      await tx.projectBudgetSheet.delete({ where: { id: existing.id } });
    }

    const sheet = await tx.projectBudgetSheet.create({
      data: {
        planningProjectId: params.planningProjectId,
        totalApproved: params.totalApproved,
        importedAt: now,
        sourceFilename: params.sourceFilename || null,
        available: true,
        lines: {
          create: params.lines.map((l) => ({
            planilhaAprovacaoId: l.planilhaAprovacaoId,
            fonteRecurso: l.fonteRecurso,
            productName: l.productName,
            stageName: l.stageName,
            state: l.state,
            city: l.city,
            itemName: l.itemName,
            categoryHint: l.categoryHint,
            unit: l.unit,
            days: l.days,
            quantity: l.quantity,
            occurrences: l.occurrences,
            unitPrice: l.unitPrice,
            homologatedAmount: l.approvedAmount,
            approvedAmount: l.approvedAmount,
            salicComprovado: l.salicComprovado,
            sortOrder: l.sortOrder,
          })),
        },
      },
      include: { lines: true },
    });

    await tx.planningProject.update({
      where: { id: params.planningProjectId },
      data: {
        importedAt: now,
        importSource: params.importSource,
      },
    });

    return sheet;
  });
}
