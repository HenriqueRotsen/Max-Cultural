"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatFullAddress } from "@/lib/catalog/address";
import { lookupMunicipioCoords } from "@/lib/catalog/municipio-coords";
import { indexServiceEmbedding } from "@/lib/catalog/embeddings";
import { lookupCep, lookupCnpj } from "@/lib/catalog/brasil-api";
import { parseServiceCategory } from "@/lib/catalog/categories";
import {
  computeTotal,
  isPriceUnit,
  parsePriceUnit,
} from "@/lib/catalog/price-units";
import { recomputeServiceStats, recomputeSupplierStats } from "@/lib/catalog/ratings";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isValidCgccpf, cgccpfValidationError, normalizeCgccpf } from "@/lib/format";

export type CatalogActionState = { error?: string; ok?: boolean };

async function workspaceId() {
  const { entitlements } = await getWorkspaceContext();
  return entitlements.workspaceId;
}

function empty(value: FormDataEntryValue | null) {
  const s = String(value || "").trim();
  return s || null;
}

function parseMoney(raw: string): number {
  const s = String(raw || "").trim();
  if (!s) return NaN;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}

function refreshCatalog() {
  revalidatePath("/fornecedores");
  revalidatePath("/fornecedores/empresas");
  revalidatePath("/fornecedores/servicos");
  revalidatePath("/fornecedores/contratacoes");
  revalidatePath("/fornecedores/favoritos");
  revalidatePath("/fornecedores/analises");
  revalidatePath("/fornecedores/mapa");
}

export async function lookupCnpjAction(cnpj: string) {
  return lookupCnpj(cnpj);
}

export async function lookupCepAction(cep: string) {
  return lookupCep(cep);
}

export async function upsertCatalogSupplier(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const ws = await workspaceId();
  const id = empty(formData.get("id"));
  const cnpj = normalizeCgccpf(String(formData.get("cnpj") || ""));
  const name = String(formData.get("name") || "").trim();
  const docError = cgccpfValidationError(cnpj);
  if (docError) return { error: docError };
  if (!isValidCgccpf(cnpj)) return { error: "CNPJ ou CPF inválido." };
  if (name.length < 2) return { error: "Informe a razão social." };

  const streetType = empty(formData.get("streetType"));
  const streetName = empty(formData.get("streetName"));
  const streetNumber = empty(formData.get("streetNumber"));
  const complement = empty(formData.get("complement"));
  const neighborhood = empty(formData.get("neighborhood"));
  const city = empty(formData.get("city"));
  const state = empty(formData.get("state"));
  const zipCode = empty(formData.get("zipCode"));
  const coords = lookupMunicipioCoords(city, state);
  const address = formatFullAddress({
    streetType,
    streetName,
    streetNumber,
    complement,
    neighborhood,
    city,
    state,
    zipCode,
  });

  const data = {
    cnpj,
    name,
    tradeName: empty(formData.get("tradeName")),
    phone: empty(formData.get("phone")),
    email: empty(formData.get("email")),
    streetType,
    streetName,
    streetNumber,
    complement,
    neighborhood,
    city,
    cityIbgeCode: empty(formData.get("cityIbgeCode")),
    state,
    zipCode,
    notes: empty(formData.get("notes")),
    address,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
  };

  const dup = await prisma.catalogSupplier.findUnique({
    where: { workspaceId_cnpj: { workspaceId: ws, cnpj } },
  });
  if (dup && dup.id !== id) {
    if (!id) {
      refreshCatalog();
      redirect(`/fornecedores/empresas/${dup.id}`);
    }
    return { error: "Já existe um fornecedor com este CNPJ/CPF." };
  }

  if (id) {
    const current = await prisma.catalogSupplier.findFirst({
      where: { id, workspaceId: ws },
    });
    if (!current) return { error: "Fornecedor não encontrado." };
    await prisma.catalogSupplier.update({ where: { id }, data });
    refreshCatalog();
    redirect(`/fornecedores/empresas/${id}`);
  }

  const created = await prisma.catalogSupplier.create({
    data: { ...data, workspaceId: ws },
  });
  refreshCatalog();
  redirect(`/fornecedores/empresas/${created.id}`);
}

export async function deleteCatalogSupplier(id: string) {
  const ws = await workspaceId();
  const current = await prisma.catalogSupplier.findFirst({
    where: { id, workspaceId: ws },
    select: { fromAudit: true },
  });
  if (!current) {
    redirect("/fornecedores/empresas");
  }
  if (current.fromAudit) {
    redirect(`/fornecedores/empresas/${id}`);
  }
  await prisma.catalogSupplier.deleteMany({ where: { id, workspaceId: ws } });
  refreshCatalog();
  redirect("/fornecedores/empresas");
}

export async function toggleCatalogFavorite(supplierId: string) {
  const ws = await workspaceId();
  const existing = await prisma.catalogFavorite.findUnique({
    where: { workspaceId_supplierId: { workspaceId: ws, supplierId } },
  });
  if (existing) {
    await prisma.catalogFavorite.delete({ where: { id: existing.id } });
  } else {
    const supplier = await prisma.catalogSupplier.findFirst({
      where: { id: supplierId, workspaceId: ws },
    });
    if (!supplier) return;
    await prisma.catalogFavorite.create({ data: { workspaceId: ws, supplierId } });
  }
  refreshCatalog();
}

export async function upsertCatalogService(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const ws = await workspaceId();
  const id = empty(formData.get("id"));
  const supplierId = String(formData.get("supplierId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Informe o nome do serviço." };
  const supplier = await prisma.catalogSupplier.findFirst({
    where: { id: supplierId, workspaceId: ws },
  });
  if (!supplier) return { error: "Fornecedor inválido." };

  const category = parseServiceCategory(String(formData.get("category") || ""));
  const defaultPriceUnit = parsePriceUnit(String(formData.get("defaultPriceUnit") || ""));
  const payload = {
    name,
    category,
    description: empty(formData.get("description")),
    defaultPriceUnit,
    supplierId,
  };

  if (id) {
    const current = await prisma.catalogService.findFirst({
      where: { id, supplier: { workspaceId: ws } },
    });
    if (!current) return { error: "Serviço não encontrado." };
    await prisma.catalogService.update({ where: { id }, data: payload });
    await indexServiceEmbedding({
      id,
      name: payload.name,
      description: payload.description,
    });
    refreshCatalog();
    redirect(`/fornecedores/servicos/${id}`);
  }

  const created = await prisma.catalogService.create({ data: payload });
  await indexServiceEmbedding({
    id: created.id,
    name: payload.name,
    description: payload.description,
  });
  refreshCatalog();
  redirect(`/fornecedores/servicos/${created.id}`);
}

export async function deleteCatalogService(id: string) {
  const ws = await workspaceId();
  const row = await prisma.catalogService.findFirst({
    where: { id, supplier: { workspaceId: ws } },
  });
  if (!row) return;
  await prisma.catalogService.delete({ where: { id } });
  await recomputeSupplierStats(row.supplierId);
  refreshCatalog();
  redirect("/fornecedores/servicos");
}

export async function upsertCatalogEngagement(
  _prev: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const ws = await workspaceId();
  const id = empty(formData.get("id"));
  const serviceId = String(formData.get("serviceId") || "");
  const service = await prisma.catalogService.findFirst({
    where: { id: serviceId, supplier: { workspaceId: ws } },
  });
  if (!service) return { error: "Serviço inválido." };

  const priceUnit = parsePriceUnit(String(formData.get("priceUnit") || "closed"));
  if (!priceUnit || !isPriceUnit(priceUnit)) return { error: "Unidade de preço inválida." };

  let quantity = Number(String(formData.get("quantity") || "1").replace(",", "."));
  if (priceUnit === "closed") quantity = 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantidade inválida." };

  let unitPrice = parseMoney(String(formData.get("unitPrice") || ""));
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    const total = parseMoney(String(formData.get("price") || ""));
    if (!Number.isFinite(total) || total < 0) return { error: "Preço inválido." };
    unitPrice = priceUnit === "closed" ? total : total / quantity;
  }
  const price = computeTotal(unitPrice, quantity);
  const hiredAtRaw = String(formData.get("hiredAt") || "");
  const hiredAt = hiredAtRaw ? new Date(`${hiredAtRaw}T12:00:00`) : new Date();
  if (Number.isNaN(hiredAt.getTime())) return { error: "Data da contratação inválida." };

  const ratingRaw = String(formData.get("rating") || "");
  const rating = ratingRaw ? Number(ratingRaw) : null;
  const delayed = formData.get("delayed") === "1";

  const payload = {
    workspaceId: ws,
    serviceId,
    price,
    unitPrice,
    quantity,
    priceUnit,
    hiredAt,
    location: empty(formData.get("location")),
    notes: empty(formData.get("notes")),
    rating: rating && rating >= 1 && rating <= 5 ? rating : null,
    ratingComment: empty(formData.get("ratingComment")),
    delayed,
    delayDays: delayed ? Number(formData.get("delayDays") || 0) || null : null,
  };

  if (id) {
    await prisma.catalogEngagement.updateMany({
      where: { id, workspaceId: ws },
      data: payload,
    });
  } else {
    await prisma.catalogEngagement.create({ data: payload });
  }
  await recomputeServiceStats(serviceId);
  await recomputeSupplierStats(service.supplierId);
  refreshCatalog();
  redirect("/fornecedores/contratacoes");
}

export async function deleteCatalogEngagement(id: string) {
  const ws = await workspaceId();
  const row = await prisma.catalogEngagement.findFirst({
    where: { id, workspaceId: ws },
  });
  if (!row) return;
  if (row.salicPaymentId) {
    redirect("/fornecedores/contratacoes");
  }
  await prisma.catalogEngagement.delete({ where: { id } });
  await recomputeServiceStats(row.serviceId);
  const service = await prisma.catalogService.findUnique({ where: { id: row.serviceId } });
  if (service) await recomputeSupplierStats(service.supplierId);
  refreshCatalog();
  redirect("/fornecedores/contratacoes");
}
