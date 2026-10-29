"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatFullAddress } from "@/lib/catalog/address";
import { lookupMunicipioCoords } from "@/lib/catalog/municipio-coords";
import { indexServiceEmbedding } from "@/lib/catalog/embeddings";
import { lookupCep, lookupCnpj } from "@/lib/catalog/brasil-api";
import { normalizeCnaeCode } from "@/lib/catalog/cnae";
import { resolveCnaeDescription } from "@/lib/catalog/cnae-lookup";
import { parseServiceCategory } from "@/lib/catalog/categories";
import { parsePriceUnit } from "@/lib/catalog/price-units";
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

export async function lookupCnaeDescriptionAction(raw: string): Promise<{
  description: string | null;
}> {
  const code = normalizeCnaeCode(raw);
  if (!code || code.length < 7) return { description: null };
  const ws = await workspaceId();
  const description = await resolveCnaeDescription(ws, code);
  return { description };
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

  const isCnpj = cnpj.length === 14;
  const cnaeCode = normalizeCnaeCode(String(formData.get("cnaeCode") || ""));
  const cnaeDescription = empty(formData.get("cnaeDescription"));
  if (isCnpj && !cnaeCode) {
    return { error: "Informe o CNAE do fornecedor (obrigatório para CNPJ)." };
  }

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
    cnaeCode: isCnpj ? cnaeCode : null,
    cnaeDescription: isCnpj ? cnaeDescription : null,
    pixKey: empty(formData.get("pixKey")),
    bankName: empty(formData.get("bankName")),
    bankAgency: empty(formData.get("bankAgency")),
    bankAccount: empty(formData.get("bankAccount")),
    paymentNotes: empty(formData.get("paymentNotes")),
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
    select: { id: true },
  });
  if (!current) {
    redirect("/fornecedores/empresas");
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

export async function deleteCatalogEngagement(id: string) {
  const ws = await workspaceId();
  const row = await prisma.catalogEngagement.findFirst({
    where: { id, workspaceId: ws },
    include: { commitment: { select: { id: true } } },
  });
  if (!row) return;
  if (row.commitment) {
    redirect("/fornecedores/contratacoes");
  }
  await prisma.catalogEngagement.delete({ where: { id } });
  await recomputeServiceStats(row.serviceId);
  const service = await prisma.catalogService.findUnique({ where: { id: row.serviceId } });
  if (service) await recomputeSupplierStats(service.supplierId);
  refreshCatalog();
  redirect("/fornecedores/contratacoes");
}
