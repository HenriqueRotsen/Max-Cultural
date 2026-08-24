import { prisma } from "@/lib/db";

export async function recomputeServiceStats(serviceId: string) {
  const [rated, priced] = await Promise.all([
    prisma.catalogEngagement.aggregate({
      where: { serviceId, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.catalogEngagement.aggregate({
      where: { serviceId },
      _avg: { price: true },
    }),
  ]);

  await prisma.catalogService.update({
    where: { id: serviceId },
    data: {
      avgRating: rated._avg.rating ?? 0,
      ratingCount: rated._count.rating,
      avgPrice: Number(priced._avg.price ?? 0),
    },
  });
}

export async function recomputeSupplierStats(supplierId: string) {
  const services = await prisma.catalogService.findMany({
    where: { supplierId },
    select: { id: true },
  });
  const ids = services.map((s) => s.id);
  if (ids.length === 0) {
    await prisma.catalogSupplier.update({
      where: { id: supplierId },
      data: { avgRating: 0, ratingCount: 0 },
    });
    return;
  }

  const agg = await prisma.catalogEngagement.aggregate({
    where: { serviceId: { in: ids }, rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.catalogSupplier.update({
    where: { id: supplierId },
    data: {
      avgRating: agg._avg.rating ?? 0,
      ratingCount: agg._count.rating,
    },
  });
}
