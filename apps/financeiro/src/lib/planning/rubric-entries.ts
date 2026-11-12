"use server";

import { prisma } from "@/lib/db";
import { getWorkspaceContext, requireUser } from "@/lib/auth/session";
import {
  resolveEngagementDocuments,
  type EngagementDocItem,
} from "@/lib/catalog/engagement-docs";


export type RubricEntry = {
  commitmentId: string;
  supplierName: string;
  amount: number;
  status: "RESERVED" | "PAID" | "CANCELLED";
  nfPending: boolean;
  isReimbursement: boolean;
  /** Data do pagamento (pago) ou data prevista (reservado). */
  date: string | null;
  /** NF/RPA, comprovante e guias, como no botão "Docs" de Fornecedores. */
  docs: EngagementDocItem[];
  pedidoParcel: number | null;
};

const docSelect = { id: true, kind: true, filename: true, mimeType: true, supportType: true } as const;

/**
 * Lançamentos de uma rubrica: reservas e pagamentos feitos no sistema, com os
 * documentos (NF e comprovante) para abrir. Responde "em que rubrica lancei
 * tal pagamento?" sem sair da planilha.
 */
export async function listRubricEntries(budgetLineId: string): Promise<{
  entries: RubricEntry[];
  error?: string;
}> {
  await requireUser();
  const { entitlements } = await getWorkspaceContext();

  const commitments = await prisma.rubricCommitment.findMany({
    where: {
      budgetLineId,
      workspaceId: entitlements.workspaceId,
      status: { in: ["RESERVED", "PAID"] },
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      engagement: { select: { service: { select: { supplier: { select: { name: true } } } } } },
      pedido: { select: { sourceDocument: { select: docSelect } } },
      documents: { select: docSelect, orderBy: { createdAt: "desc" } },
      allocations: {
        select: { document: { select: { ...docSelect, status: true } } },
      },
    },
  });

  const entries: RubricEntry[] = commitments.map((c) => {
    const docs = resolveEngagementDocuments({
      documents: c.pedido?.sourceDocument ? [c.pedido.sourceDocument] : [],
      commitment: {
        documents: c.documents,
        allocations: c.allocations.filter((a) => a.document.status === "IMPORTED"),
      },
    });
    const date = c.status === "PAID" ? c.paidAt : c.expectedPayAt;
    return {
      commitmentId: c.id,
      supplierName: c.engagement.service.supplier.name,
      amount: Number(c.amount),
      status: c.status,
      nfPending: c.nfPending,
      isReimbursement: c.isReimbursement,
      date: date ? date.toISOString() : null,
      docs,
      pedidoParcel: c.pedidoId ? c.installmentNumber : null,
    };
  });

  return { entries };
}
