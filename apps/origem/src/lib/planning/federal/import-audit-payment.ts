import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { canExceedRubric } from "@/lib/planning/acl";
import { findOrCreateCatalogServiceForRubric } from "@/lib/catalog/service-from-rubric";
import { normalizeCgccpf } from "@/lib/format";
import {
  canReserveAmount,
  computeProjectBalance,
  isAdminProduct,
  n,
} from "@/lib/planning/rubric-balance";
import { loadPublishedPaidByLine } from "@/lib/planning/federal/audit-reconcile";
import { isFederalPlanning } from "@/lib/planning/lifecycle";

/**
 * Importa um Payment da auditoria como reserva PAID + proof stub no planejamento.
 */
export async function importAuditPaymentAsPaidCommitment(params: {
  planningProjectId: string;
  paymentId: string;
  workspaceId: string;
  createdById?: string | null;
}): Promise<{ commitmentId: string }> {
  const project = await prisma.planningProject.findFirst({
    where: { id: params.planningProjectId, workspaceId: params.workspaceId },
    include: {
      sheet: { include: { lines: true } },
      commitments: { where: { status: { in: ["RESERVED", "PAID"] } } },
      project: { select: { id: true, valorCaptado: true } },
    },
  });
  if (!project) throw new Error("Projeto não encontrado.");
  if (!isFederalPlanning(project.jurisdiction)) {
    throw new Error("Importação disponível só para projetos federais.");
  }
  if (!project.projectId || !project.sheet) {
    throw new Error("Projeto sem vínculo de auditoria ou sem planilha homologada.");
  }

  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, projectId: project.projectId },
    include: { supplier: { select: { cgccpf: true, name: true } } },
  });
  if (!payment) throw new Error("Pagamento da auditoria não encontrado.");
  if (!payment.externalId) {
    throw new Error("Pagamento sem idComprovantePagamento — não é possível importar.");
  }
  if (!payment.planilhaAprovacaoId) {
    throw new Error("Pagamento sem idPlanilhaAprovacao — associe a rubrica no SALIC primeiro.");
  }

  const existingProof = await prisma.planningDocument.findFirst({
    where: {
      planningProjectId: project.id,
      salicComprovanteId: payment.externalId,
    },
    select: { id: true },
  });
  if (existingProof) {
    throw new Error("Este comprovante já está vinculado a uma reserva no planejamento.");
  }

  const takenEngagement = await prisma.catalogEngagement.findFirst({
    where: { salicPaymentId: payment.id },
    select: { id: true, commitment: { select: { id: true } } },
  });
  if (takenEngagement?.commitment) {
    throw new Error("Já existe reserva ligada a este pagamento da auditoria.");
  }

  const planilhaId = String(payment.planilhaAprovacaoId).trim();
  const line = project.sheet.lines.find(
    (l) => l.planilhaAprovacaoId && String(l.planilhaAprovacaoId).trim() === planilhaId,
  );
  if (!line) {
    throw new Error(
      `Rubrica idPlanilhaAprovacao ${planilhaId} não encontrada na planilha homologada.`,
    );
  }

  const amount = n(payment.amount);
  if (!(amount > 0)) throw new Error("Valor do pagamento inválido.");

  const publishedPaidByLine = await loadPublishedPaidByLine(project.id);
  const balance = computeProjectBalance({
    lines: project.sheet.lines,
    commitments: project.commitments,
    valorCaptado: project.project?.valorCaptado,
    captadoRecebido: project.captadoRecebido,
    captadoTransferido: project.captadoTransferido,
    rendimentos: project.rendimentos,
    publishedPaidByLine,
  });

  const allowOverflow = await canExceedRubric();
  const check = canReserveAmount({
    lineId: line.id,
    amount,
    balance,
    allowOverflow: allowOverflow && !isAdminProduct(line.productName),
  });
  if (!check.ok) throw new Error(check.message);

  const cnpj = normalizeCgccpf(payment.supplier.cgccpf);
  if (!cnpj) throw new Error("Fornecedor do pagamento sem CPF/CNPJ válido.");

  const paidAt = payment.paymentDate || new Date();
  const dir = path.join(process.cwd(), "uploads", "planning", "audit-import");
  await mkdir(dir, { recursive: true });
  const filename = `AUDIT_${payment.externalId}.txt`;
  const storagePath = path.join(dir, `${project.id}_${payment.externalId}.txt`);
  const body = Buffer.from(
    `Importado da auditoria SALIC\nidComprovante=${payment.externalId}\npaymentId=${payment.id}\n`,
    "utf8",
  );
  await writeFile(storagePath, body);

  const commitmentId = await prisma.$transaction(async (tx) => {
    if (takenEngagement && !takenEngagement.commitment) {
      await tx.catalogEngagement.delete({ where: { id: takenEngagement.id } });
    }

    const supplier = await tx.catalogSupplier.upsert({
      where: {
        workspaceId_cnpj: { workspaceId: params.workspaceId, cnpj },
      },
      create: {
        workspaceId: params.workspaceId,
        cnpj,
        name: payment.supplier.name || "Fornecedor",
        fromAudit: true,
      },
      update: {
        name: payment.supplier.name || undefined,
        fromAudit: true,
      },
    });

    const service = await findOrCreateCatalogServiceForRubric(tx, {
      supplierId: supplier.id,
      rubricName: line.itemName,
      categoryHint: line.categoryHint,
    });

    const engagement = await tx.catalogEngagement.create({
      data: {
        workspaceId: params.workspaceId,
        serviceId: service.id,
        price: amount,
        unitPrice: amount,
        quantity: 1,
        priceUnit: "closed",
        hiredAt: paidAt,
        location: project.externalCode,
        notes: payment.justification || `Importado da auditoria (${payment.externalId})`,
        salicPaymentId: payment.id,
        source: "PLANNING_MANUAL",
        planningProjectId: project.id,
        budgetLineId: line.id,
      },
    });

    const commitment = await tx.rubricCommitment.create({
      data: {
        budgetLineId: line.id,
        planningProjectId: project.id,
        workspaceId: params.workspaceId,
        engagementId: engagement.id,
        amount,
        status: "PAID",
        paidAt,
        paidWithoutNf: true,
        nfPending: false,
        expectedPayAt: paidAt,
        createdById: params.createdById || null,
      },
    });

    const proof = await tx.planningDocument.create({
      data: {
        kind: "PAYMENT_PROOF",
        status: "IMPORTED",
        filename,
        mimeType: "text/plain",
        storagePath,
        byteSize: body.length,
        workspaceId: params.workspaceId,
        planningProjectId: project.id,
        engagementId: engagement.id,
        commitmentId: commitment.id,
        salicComprovanteId: payment.externalId,
        salicPublishedAt: paidAt,
        salicPublishMode: "PROOF_ONLY",
      },
    });

    await tx.documentRubricAllocation.create({
      data: {
        documentId: proof.id,
        budgetLineId: line.id,
        commitmentId: commitment.id,
        sharePct: 100,
        amount,
      },
    });

    return commitment.id;
  });

  return { commitmentId };
}
