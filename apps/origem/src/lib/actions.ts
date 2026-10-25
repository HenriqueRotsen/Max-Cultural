"use server";

/** Cadastro de proponentes (compartilhados com o app Auditoria). */

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { encryptCredential, normalizeCgccpf } from "@/lib/crypto";

const accountSchema = z.object({
  name: z.string().min(2, "Informe o nome"),
  cgccpf: z.string().min(11, "Informe CPF ou CNPJ"),
  salicUsername: z.string().optional(),
  salicPassword: z.string().optional(),
  extraPronacs: z.string().optional(),
  personType: z.enum(["PJ", "PF", "MEI"]).optional(),
  active: z.boolean().optional(),
});

function parseAccountForm(formData: FormData, syncEnabled: boolean) {
  const personTypeRaw = String(formData.get("personType") || "PJ");
  return accountSchema.safeParse({
    name: formData.get("name"),
    cgccpf: formData.get("cgccpf"),
    salicUsername: syncEnabled
      ? String(formData.get("salicUsername") || "") || undefined
      : undefined,
    salicPassword: syncEnabled
      ? String(formData.get("salicPassword") || "") || undefined
      : undefined,
    extraPronacs: String(formData.get("extraPronacs") || "") || undefined,
    personType: personTypeRaw === "PF" || personTypeRaw === "MEI" ? personTypeRaw : "PJ",
    active:
      formData.get("active") === "on" ||
      formData.get("active") === "true" ||
      formData.get("active") !== "false",
  });
}

export async function createAccount(formData: FormData) {
  try {
    await createAccountInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[createAccount]", error);
    const message = error instanceof Error ? error.message : String(error);
    redirect(
      "/contas?tab=nova&error=" +
        encodeURIComponent(`Não foi possível salvar o proponente: ${message}`.slice(0, 400)),
    );
  }
}

async function createAccountInner(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertCanCreateAccount } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();

  try {
    await assertCanCreateAccount(entitlements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Limite de contas atingido";
    redirect("/contas?tab=nova&error=" + encodeURIComponent(message));
  }

  const result = parseAccountForm(formData, entitlements.syncEnabled);
  if (!result.success) {
    const message = result.error.issues[0]?.message || "Dados inválidos";
    redirect("/contas?tab=nova&error=" + encodeURIComponent(message));
  }
  const parsed = result.data;

  try {
    await prisma.salicAccount.create({
      data: {
        name: parsed.name,
        cgccpf: normalizeCgccpf(parsed.cgccpf),
        salicUsernameEnc: entitlements.syncEnabled
          ? encryptCredential(parsed.salicUsername)
          : null,
        salicPasswordEnc: entitlements.syncEnabled
          ? encryptCredential(parsed.salicPassword)
          : null,
        extraPronacs: parsed.extraPronacs || null,
        personType: parsed.personType || "PJ",
        active: true,
        workspaceId: entitlements.workspaceId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect(
        "/contas?tab=nova&error=" +
          encodeURIComponent("Já existe um proponente com este CNPJ/CPF."),
      );
    }
    throw error;
  }

  revalidatePath("/contas");
  revalidatePath("/painel");
  redirect("/contas?tab=suas-contas&created=1");
}

export async function updateAccount(id: string, formData: FormData) {

  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();
  await assertAccountInWorkspace(id, entitlements.workspaceId);

  const clearPassword = formData.get("clearPassword") === "1";
  const result = parseAccountForm(formData, entitlements.syncEnabled);
  if (!result.success) {
    const message = result.error.issues[0]?.message || "Dados inválidos";
    redirect(`/contas?tab=suas-contas&error=${encodeURIComponent(message)}#account-${id}`);
  }
  const parsed = result.data;

  try {
    await prisma.salicAccount.update({
      where: { id },
      data: {
        name: parsed.name,
        cgccpf: normalizeCgccpf(parsed.cgccpf),
        extraPronacs: parsed.extraPronacs || null,
        personType: parsed.personType || "PJ",
        active: formData.get("active") === "on" || formData.get("active") === "true",
        ...(entitlements.syncEnabled
          ? {
              salicUsernameEnc: encryptCredential(parsed.salicUsername),
              ...(clearPassword
                ? { salicPasswordEnc: null }
                : parsed.salicPassword
                  ? { salicPasswordEnc: encryptCredential(parsed.salicPassword) }
                  : {}),
            }
          : {}),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect(
        `/contas?tab=suas-contas&error=${encodeURIComponent("Já existe um proponente com este CNPJ/CPF.")}#account-${id}`,
      );
    }
    throw error;
  }

  revalidatePath("/contas");
  revalidatePath("/painel");
  redirect("/contas?tab=suas-contas&updated=1");
}

export async function clearAccountPassword(id: string) {

  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace, assertCanSync } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();
  await assertCanSync(entitlements);
  await assertAccountInWorkspace(id, entitlements.workspaceId);

  await prisma.salicAccount.update({
    where: { id },
    data: { salicPasswordEnc: null },
  });
  revalidatePath("/contas");
  redirect("/contas?tab=suas-contas&passwordCleared=1");
}

export async function deleteAccount(id: string) {

  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();
  await assertAccountInWorkspace(id, entitlements.workspaceId);

  await prisma.salicAccount.delete({ where: { id } });
  revalidatePath("/contas");
  revalidatePath("/painel");
  redirect("/contas?tab=suas-contas");
}
