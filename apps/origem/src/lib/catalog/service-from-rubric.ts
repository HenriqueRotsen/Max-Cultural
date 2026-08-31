import type { prisma } from "@/lib/db";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Serviço no catálogo = nome da rubrica homologada (item da planilha). */
export async function findOrCreateCatalogServiceForRubric(
  tx: Tx,
  params: {
    supplierId: string;
    rubricName: string;
    categoryHint?: string | null;
  },
) {
  const rubricName = params.rubricName.trim();
  if (!rubricName) {
    throw new Error("Rubrica sem nome");
  }

  let service = await tx.catalogService.findFirst({
    where: {
      supplierId: params.supplierId,
      name: { equals: rubricName, mode: "insensitive" },
    },
  });
  if (!service) {
    service = await tx.catalogService.create({
      data: {
        supplierId: params.supplierId,
        name: rubricName,
        category: params.categoryHint || "outros",
      },
    });
  }
  return service;
}
