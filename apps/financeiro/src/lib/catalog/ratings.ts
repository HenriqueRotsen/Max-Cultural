import { prisma } from "@/lib/db";

/** Contratação de reserva cancelada (pedido desfeito) não entra nas médias. */
const NOT_CANCELLED = {
  OR: [{ commitment: { is: null } }, { commitment: { status: { not: "CANCELLED" as const } } }],
};

export async function recomputeServiceStats(serviceId: string) {
  const [rated, priced] = await Promise.all([
    prisma.catalogEngagement.aggregate({
      where: { serviceId, rating: { not: null }, ...NOT_CANCELLED },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.catalogEngagement.aggregate({
      where: { serviceId, ...NOT_CANCELLED },
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
    where: { serviceId: { in: ids }, rating: { not: null }, ...NOT_CANCELLED },
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
