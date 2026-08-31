import { isDemoMode } from "@/lib/auth/config";
import { parseServiceCategory } from "@/lib/catalog/categories";
import { recomputeServiceStats, recomputeSupplierStats } from "@/lib/catalog/ratings";
import { demoProjectWhere } from "@/lib/demo";
import { prisma } from "@/lib/db";
import { isValidCgccpf, normalizeCgccpf } from "@/lib/format";

const CHUNK = 400;

type AuditSupplier = { cgccpf: string; name: string; email: string | null };

function usableCgccpf(value: string | null | undefined): string | null {
  const digits = normalizeCgccpf(value || "");
  if (!isValidCgccpf(digits)) return null;
  return digits;
}

function serviceNameFromPayment(itemName: string | null | undefined): string {
  const name = (itemName || "").trim().replace(/\s+/g, " ");
  return name || "Comprovante SALIC";
}

function serviceKey(supplierId: string, name: string) {
  return `${supplierId}::${name.trim().toLowerCase()}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const inflightSuppliers = new Map<string, Promise<void>>();
const inflightFull = new Map<string, Promise<void>>();

/** Só cadastros (leve). Usado ao abrir o módulo — não espelha comprovantes. */
export function ensureCatalogSuppliersFromAudit(workspaceId: string): Promise<void> {
  const running = inflightSuppliers.get(workspaceId);
  if (running) return running;
  const job = syncCatalogSuppliersFromAudit(workspaceId)
    .catch((error) => {
      console.error("Falha ao espelhar fornecedores da Auditoria:", error);
    })
    .finally(() => {
      inflightSuppliers.delete(workspaceId);
    });
  inflightSuppliers.set(workspaceId, job);
  return job;
}

/** Cadastros + comprovantes. Só após sync SALIC, não na abertura das páginas. */
export function ensureCatalogFromAudit(workspaceId: string): Promise<void> {
  const running = inflightFull.get(workspaceId);
  if (running) return running;
  const job = syncCatalogFromAudit(workspaceId)
    .catch((error) => {
      console.error("Falha ao espelhar Auditoria no catálogo de fornecedores:", error);
    })
    .finally(() => {
      inflightFull.delete(workspaceId);
    });
  inflightFull.set(workspaceId, job);
  return job;
}

async function collectAuditSuppliers(workspaceId: string): Promise<AuditSupplier[]> {
  const demo = await demoProjectWhere(workspaceId);
  const projectScope = { salicAccount: { workspaceId }, ...demo };

  const [paidSuppliers, watched] = await Promise.all([
    prisma.supplier.findMany({
      where: { payments: { some: { project: projectScope } } },
      select: { cgccpf: true, name: true, email: true },
    }),
    prisma.watchedSupplier.findMany({
      where: { workspaceId },
      select: {
        cgccpf: true,
        nameQuery: true,
        label: true,
        supplier: { select: { cgccpf: true, name: true, email: true } },
      },
    }),
  ]);

  const byDoc = new Map<string, AuditSupplier>();
  for (const row of paidSuppliers) {
    const cgccpf = usableCgccpf(row.cgccpf);
    if (!cgccpf) continue;
    byDoc.set(cgccpf, { cgccpf, name: row.name, email: row.email });
  }
  for (const row of watched) {
    const cgccpf = usableCgccpf(row.supplier?.cgccpf || row.cgccpf);
    if (!cgccpf) continue;
    if (byDoc.has(cgccpf)) continue;
    const name = (row.supplier?.name || row.label || row.nameQuery || "Fornecedor").trim();
    byDoc.set(cgccpf, {
      cgccpf,
      name,
      email: row.supplier?.email ?? null,
    });
  }
  return [...byDoc.values()];
}

async function syncCatalogSuppliersFromAudit(workspaceId: string) {
  const demo = await demoProjectWhere(workspaceId);
  const [auditCount, catalogCount] = await Promise.all([
    prisma.supplier.count({
      where: {
        payments: { some: { project: { salicAccount: { workspaceId }, ...demo } } },
      },
    }),
    prisma.catalogSupplier.count({ where: { workspaceId, fromAudit: true } }),
  ]);
  if (auditCount === 0 || catalogCount >= auditCount) return;

  const rows = await collectAuditSuppliers(workspaceId);
  await upsertCatalogSuppliers(workspaceId, rows);
}

async function syncCatalogFromAudit(workspaceId: string) {
  const auditSuppliers = await collectAuditSuppliers(workspaceId);
  if (auditSuppliers.length === 0) return;

  await upsertCatalogSuppliers(workspaceId, auditSuppliers);

  const catalogByCnpj = new Map(
    (
      await prisma.catalogSupplier.findMany({
        where: { workspaceId, cnpj: { in: auditSuppliers.map((s) => s.cgccpf) } },
        select: { id: true, cnpj: true },
      })
    ).map((s) => [s.cnpj, s.id]),
  );

  await syncPaymentsAsEngagements(workspaceId, catalogByCnpj);
}

async function upsertCatalogSuppliers(workspaceId: string, rows: AuditSupplier[]) {
  if (rows.length === 0) return;

  const existing = await prisma.catalogSupplier.findMany({
    where: { workspaceId, cnpj: { in: rows.map((r) => r.cgccpf) } },
    select: { id: true, cnpj: true, email: true, fromAudit: true },
  });
  const have = new Map(existing.map((s) => [s.cnpj, s]));
  const now = new Date();
  const toCreate = [];
  const toMark: string[] = [];
  const toFillEmail: Array<{ id: string; email: string }> = [];

  for (const row of rows) {
    const cur = have.get(row.cgccpf);
    if (!cur) {
      toCreate.push({
        workspaceId,
        cnpj: row.cgccpf,
        name: row.name || "Fornecedor sem nome",
        email: row.email,
        fromAudit: true,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }
    if (!cur.fromAudit) toMark.push(cur.id);
    if (!cur.email && row.email) toFillEmail.push({ id: cur.id, email: row.email });
  }

  for (const batch of chunk(toCreate, CHUNK)) {
    await prisma.catalogSupplier.createMany({ data: batch, skipDuplicates: true });
  }
  if (toMark.length > 0) {
    await prisma.catalogSupplier.updateMany({
      where: { id: { in: toMark } },
      data: { fromAudit: true },
    });
  }
  for (const row of toFillEmail) {
    await prisma.catalogSupplier.update({
      where: { id: row.id },
      data: { email: row.email },
    });
  }
}

async function syncPaymentsAsEngagements(
  workspaceId: string,
  catalogByCnpj: Map<string, string>,
) {
  const demo = await demoProjectWhere(workspaceId);
  const projectScope = { salicAccount: { workspaceId }, ...demo };
  const [paymentIds, mirrored] = await Promise.all([
    prisma.payment.findMany({
      where: { project: projectScope },
      select: { id: true },
    }),
    prisma.catalogEngagement.findMany({
      where: { workspaceId, salicPaymentId: { not: null } },
      select: { salicPaymentId: true },
    }),
  ]);

  const have = new Set(mirrored.map((m) => m.salicPaymentId).filter(Boolean) as string[]);
  const missingIds = paymentIds.map((p) => p.id).filter((id) => !have.has(id));
  if (missingIds.length === 0) {
    await dropOrphanSalicEngagements(workspaceId, paymentIds.map((p) => p.id));
    return;
  }

  const affectedServiceIds = new Set<string>();
  const affectedSupplierIds = new Set<string>();

  for (const ids of chunk(missingIds, CHUNK)) {
    const payments = await prisma.payment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        externalId: true,
        itemName: true,
        amount: true,
        paymentDate: true,
        documentNumber: true,
        justification: true,
        createdAt: true,
        supplier: { select: { cgccpf: true } },
        project: { select: { pronac: true } },
      },
    });

    const { tryLinkPaymentToPlanningEngagement } = await import(
      "@/lib/planning/federal/audit-reconcile"
    );

    const paymentsToMirror = [];
    for (const payment of payments) {
      const linked = await tryLinkPaymentToPlanningEngagement({
        paymentId: payment.id,
        paymentExternalId: payment.externalId,
        workspaceId,
      });
      if (!linked) paymentsToMirror.push(payment);
    }

    const supplierIds = [
      ...new Set(
        paymentsToMirror
          .map((p) => catalogByCnpj.get(usableCgccpf(p.supplier.cgccpf) || "") || "")
          .filter(Boolean),
      ),
    ];
    const existingServices = supplierIds.length
      ? await prisma.catalogService.findMany({
          where: { supplierId: { in: supplierIds } },
          select: { id: true, supplierId: true, name: true },
        })
      : [];
    const services = new Map(
      existingServices.map((s) => [serviceKey(s.supplierId, s.name), s.id]),
    );

    const now = new Date();
    const newServices: Array<{
      key: string;
      supplierId: string;
      name: string;
      category: string | null;
    }> = [];
    const seenNew = new Set<string>();

    for (const payment of paymentsToMirror) {
      const cgccpf = usableCgccpf(payment.supplier.cgccpf);
      const supplierId = cgccpf ? catalogByCnpj.get(cgccpf) : undefined;
      if (!supplierId) continue;
      const name = serviceNameFromPayment(payment.itemName);
      const key = serviceKey(supplierId, name);
      if (services.has(key) || seenNew.has(key)) continue;
      seenNew.add(key);
      newServices.push({
        key,
        supplierId,
        name,
        category: parseServiceCategory(name),
      });
    }

    if (newServices.length > 0) {
      await prisma.catalogService.createMany({
        data: newServices.map((s) => ({
          supplierId: s.supplierId,
          name: s.name,
          category: s.category,
          defaultPriceUnit: "closed",
          createdAt: now,
          updatedAt: now,
        })),
      });
      const created = await prisma.catalogService.findMany({
        where: {
          OR: newServices.map((s) => ({
            supplierId: s.supplierId,
            name: s.name,
          })),
        },
        select: { id: true, supplierId: true, name: true },
      });
      for (const s of created) services.set(serviceKey(s.supplierId, s.name), s.id);
    }

    const engagements = [];
    for (const payment of paymentsToMirror) {
      const cgccpf = usableCgccpf(payment.supplier.cgccpf);
      const supplierId = cgccpf ? catalogByCnpj.get(cgccpf) : undefined;
      if (!supplierId) continue;
      const name = serviceNameFromPayment(payment.itemName);
      const serviceId = services.get(serviceKey(supplierId, name));
      if (!serviceId) continue;
      const price = Number(payment.amount || 0);
      const hiredAt = payment.paymentDate || payment.createdAt;
      const bits = [
        payment.documentNumber ? `Doc. ${payment.documentNumber}` : null,
        payment.justification,
      ].filter(Boolean);
      engagements.push({
        workspaceId,
        serviceId,
        price,
        unitPrice: price,
        quantity: 1,
        priceUnit: "closed",
        hiredAt,
        location: payment.project.pronac,
        notes: bits.length ? bits.join(" · ") : null,
        salicPaymentId: payment.id,
        source: "AUDIT",
        createdAt: now,
        updatedAt: now,
      });
      affectedServiceIds.add(serviceId);
      affectedSupplierIds.add(supplierId);
    }

    for (const batch of chunk(engagements, CHUNK)) {
      await prisma.catalogEngagement.createMany({ data: batch, skipDuplicates: true });
    }
  }

  await dropOrphanSalicEngagements(workspaceId, paymentIds.map((p) => p.id));

  for (const id of affectedServiceIds) await recomputeServiceStats(id);
  for (const id of affectedSupplierIds) await recomputeSupplierStats(id);
}

async function dropOrphanSalicEngagements(workspaceId: string, livePaymentIds: string[]) {
  if (isDemoMode()) return;
  const live = new Set(livePaymentIds);
  const mirrored = await prisma.catalogEngagement.findMany({
    where: {
      workspaceId,
      salicPaymentId: { not: null },
      source: "AUDIT",
      // Não apagar contratações do planejamento (têm reserva).
      commitment: { is: null },
    },
    select: { id: true, serviceId: true, salicPaymentId: true },
  });
  const stale = mirrored.filter(
    (row) => !row.salicPaymentId || !live.has(row.salicPaymentId),
  );
  if (stale.length === 0) return;

  const serviceIds = [...new Set(stale.map((s) => s.serviceId))];
  await prisma.catalogEngagement.deleteMany({
    where: { id: { in: stale.map((s) => s.id) } },
  });

  const services = await prisma.catalogService.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, supplierId: true },
  });
  for (const s of services) await recomputeServiceStats(s.id);
  for (const id of new Set(services.map((s) => s.supplierId))) {
    await recomputeSupplierStats(id);
  }
}
