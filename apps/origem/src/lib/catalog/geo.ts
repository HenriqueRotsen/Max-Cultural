import { formatFullAddress, type AddressParts } from "@/lib/catalog/address";
import { lookupCnpj } from "@/lib/catalog/brasil-api";
import {
  coordsFromSupplier,
  lookupMunicipioCoords,
} from "@/lib/catalog/municipio-coords";
import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";

export async function countPendingCnpjAddresses(workspaceId: string): Promise<number> {
  const rows = await prisma.catalogSupplier.findMany({
    where: { workspaceId, city: null },
    select: { cnpj: true },
  });
  return rows.filter((s) => normalizeCgccpf(s.cnpj).length === 14).length;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function persistCityCoords(workspaceId: string): Promise<number> {
  const missing = await prisma.catalogSupplier.findMany({
    where: {
      workspaceId,
      OR: [{ latitude: null }, { longitude: null }],
      city: { not: null },
      state: { not: null },
    },
    select: { id: true, city: true, state: true },
  });

  let updated = 0;
  for (const row of missing) {
    const coords = lookupMunicipioCoords(row.city, row.state);
    if (!coords) continue;
    await prisma.catalogSupplier.update({
      where: { id: row.id },
      data: { latitude: coords.lat, longitude: coords.lng },
    });
    updated += 1;
  }
  return updated;
}

/** Completa município via CNPJ (BrasilAPI) para quem veio da Auditoria sem endereço. */
export async function backfillCatalogAddresses(
  workspaceId: string,
  options?: { limit?: number },
): Promise<{ updated: number; failed: number; remaining: number }> {
  const limit = options?.limit ?? 5;

  const pending = await prisma.catalogSupplier.findMany({
    where: {
      workspaceId,
      city: null,
    },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      cnpj: true,
      streetType: true,
      streetName: true,
      streetNumber: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
      address: true,
    },
    take: 40,
  });

  const eligible = pending
    .filter((s) => normalizeCgccpf(s.cnpj).length === 14)
    .slice(0, limit);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < eligible.length; i++) {
    const row = eligible[i]!;
    const found = await lookupCnpj(row.cnpj);
    if (!found?.city || !found.state) {
      failed += 1;
      await prisma.catalogSupplier.update({
        where: { id: row.id },
        data: { zipCode: row.zipCode },
      });
    } else {
      const parts: AddressParts = {
        streetType: found.streetType || row.streetType,
        streetName: found.streetName || row.streetName,
        streetNumber: found.streetNumber || row.streetNumber,
        complement: found.complement || row.complement,
        neighborhood: found.neighborhood || row.neighborhood,
        city: found.city,
        state: found.state,
        zipCode: found.zipCode || row.zipCode,
      };
      const coords = coordsFromSupplier({
        city: parts.city,
        state: parts.state,
      });
      await prisma.catalogSupplier.update({
        where: { id: row.id },
        data: {
          streetType: parts.streetType,
          streetName: parts.streetName,
          streetNumber: parts.streetNumber,
          complement: parts.complement,
          neighborhood: parts.neighborhood,
          city: parts.city,
          state: parts.state,
          zipCode: parts.zipCode,
          address: formatFullAddress(parts) || row.address,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        },
      });
      updated += 1;
    }
    if (i < eligible.length - 1) await sleep(400);
  }

  const remaining = await countPendingCnpjAddresses(workspaceId);

  return { updated, failed, remaining };
}
