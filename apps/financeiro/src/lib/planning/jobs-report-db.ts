import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";
import { buildJobsReport, type JobRow } from "@/lib/planning/jobs-report";

/**
 * Quem o projeto contratou: lançamentos do sistema (reservados e pagos, ou só
 * pagos) e pagamentos feitos direto no SALIC que ainda não têm lançamento.
 */
export async function loadJobsReport(
  planningProjectId: string,
  workspaceId: string,
  opts: { onlyPaid: boolean },
) {
  const [commitments, salicOnly] = await Promise.all([
    prisma.rubricCommitment.findMany({
      where: {
        planningProjectId,
        workspaceId,
        status: opts.onlyPaid ? "PAID" : { in: ["RESERVED", "PAID"] },
      },
      select: {
        amount: true,
        engagement: {
          select: {
            service: {
              select: {
                supplier: { select: { id: true, cnpj: true, name: true, city: true, state: true } },
              },
            },
          },
        },
      },
    }),
    prisma.salicPaymentRecord.findMany({
      where: { planningProjectId, workspaceId, removedAt: null, linkedProofId: null },
      select: { supplierDoc: true, supplierName: true, amount: true },
    }),
  ]);

  const salicDocs = [...new Set(salicOnly.map((r) => normalizeCgccpf(r.supplierDoc)))];
  const catalog = salicDocs.length
    ? await prisma.catalogSupplier.findMany({
        where: { workspaceId, cnpj: { in: salicDocs } },
        select: { id: true, cnpj: true, city: true, state: true },
      })
    : [];
  const catalogByDoc = new Map(catalog.map((c) => [normalizeCgccpf(c.cnpj), c]));

  const rows: JobRow[] = [
    ...commitments.map((c) => {
      const s = c.engagement.service.supplier;
      return {
        doc: normalizeCgccpf(s.cnpj),
        name: s.name,
        city: s.city,
        state: s.state,
        amount: Number(c.amount),
        supplierId: s.id,
      };
    }),
    ...salicOnly.map((r) => {
      const doc = normalizeCgccpf(r.supplierDoc);
      const cat = catalogByDoc.get(doc);
      return {
        doc,
        name: r.supplierName,
        city: cat?.city ?? null,
        state: cat?.state ?? null,
        amount: Number(r.amount),
        supplierId: cat?.id ?? null,
      };
    }),
  ];
  return buildJobsReport(rows);
}
