import { prisma } from "@/lib/db";
import { RULESET_CATALOG } from "@/lib/compliance/defaults";
import type { Prisma } from "@/generated/prisma/client";

/** Garante o catálogo histórico de INs no banco (idempotente). */
export async function seedComplianceCatalog() {
  for (const item of RULESET_CATALOG) {
    const jurisdiction = item.jurisdiction ?? "FEDERAL";
    const kind = item.kind ?? "BOTH";
    await prisma.complianceRuleset.upsert({
      where: { version: item.version },
      create: {
        version: item.version,
        sourceCode: item.sourceCode,
        sourceUrl: item.sourceUrl,
        jurisdiction,
        kind,
        effectiveFrom: new Date(item.effectiveFrom),
        effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
        caps: item.caps as unknown as Prisma.InputJsonValue,
        planning: (item.planning ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        legalSummary: item.legalSummary,
        jurisprudenceNotes: item.jurisprudenceNotes,
        status: item.status,
        needsReview: false,
        notes: item.notes || null,
      },
      update: {
        sourceCode: item.sourceCode,
        sourceUrl: item.sourceUrl,
        jurisdiction,
        kind,
        effectiveFrom: new Date(item.effectiveFrom),
        effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
        caps: item.caps as unknown as Prisma.InputJsonValue,
        planning: (item.planning ?? null) as unknown as Prisma.InputJsonValue | undefined,
        legalSummary: item.legalSummary,
        jurisprudenceNotes: item.jurisprudenceNotes,
        status: item.status,
        notes: item.notes || null,
      },
    });
  }

  // Garante um único active federal: o da versão vigente
  await prisma.complianceRuleset.updateMany({
    where: {
      status: "active",
      jurisdiction: "FEDERAL",
      version: { not: "in-minc-29-2026" },
    },
    data: { status: "archived" },
  });
  await prisma.complianceRuleset.updateMany({
    where: { version: "in-minc-29-2026" },
    data: {
      status: "active",
      needsReview: false,
      jurisdiction: "FEDERAL",
      kind: "BOTH",
    },
  });
}
