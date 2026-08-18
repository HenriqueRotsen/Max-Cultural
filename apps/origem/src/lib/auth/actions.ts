"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  generateTemporaryPassword,
  validateStrongPassword,
} from "@/lib/auth/password";
import { getSessionUser, requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  parseUserContactAddressForm,
  userContactAddressData,
} from "@/lib/auth/user-contact";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Informe e-mail e senha"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=" + encodeURIComponent("E-mail ou senha incorretos"));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    const profile = await prisma.appUser.findUnique({ where: { id: user.id } });
    if (profile && !profile.active) {
      await supabase.auth.signOut();
      redirect("/login?error=" + encodeURIComponent("Conta desativada. Fale com o administrador."));
    }
    if (profile?.mustChangePassword) {
      redirect("/alterar-senha");
    }
  }

  redirect("/painel");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { isHubSsoEnabled } = await import("@/lib/auth/hub");
  if (isHubSsoEnabled()) {
    const hub = (process.env.NEXT_PUBLIC_CULTURAL_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    redirect(`${hub}/logout`);
  }
  redirect("/login");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  if (!email) {
    redirect("/recuperar-senha?error=" + encodeURIComponent("Informe o e-mail"));
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin.replace(/\/$/, "")}/auth/callback?next=/redefinir-senha`,
  });

  redirect(
    "/recuperar-senha?ok=" +
      encodeURIComponent("Se o e-mail existir, enviaremos o link de recuperação."),
  );
}

export async function updatePassword(formData: FormData) {
  const returnTo =
    String(formData.get("returnTo") || "") === "/redefinir-senha"
      ? "/redefinir-senha"
      : "/alterar-senha";
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password !== confirm) {
    redirect(returnTo + "?error=" + encodeURIComponent("As senhas não coincidem"));
  }
  const check = validateStrongPassword(password);
  if (!check.ok) {
    redirect(returnTo + "?error=" + encodeURIComponent(check.errors[0]!));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(returnTo + "?error=" + encodeURIComponent(error.message));
  }

  const session = await getSessionUser();
  if (session) {
    await prisma.appUser.update({
      where: { id: session.id },
      data: { mustChangePassword: false },
    });
  }

  redirect("/painel");
}

export async function adminCreateUser(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") || "").trim() || null;
  const roleRaw = String(formData.get("role") || "USER");
  const role = roleRaw === "ADMIN" ? "ADMIN" : "USER";
  const planRaw = String(formData.get("plan") || "ESSENTIAL");
  const plan = planRaw === "PRO" ? "PRO" : "ESSENTIAL";
  const maxAccountsRaw = Number(formData.get("maxAccounts") || (plan === "PRO" ? 10 : 1));
  const maxAccounts = plan === "ESSENTIAL" ? 1 : Math.max(1, maxAccountsRaw || 10);
  const workspaceName =
    String(formData.get("workspaceName") || "").trim() ||
    name ||
    email.split("@")[0] ||
    "Cliente";
  const existingWorkspaceId = String(formData.get("workspaceId") || "").trim() || null;

  if (!email) {
    redirect("/admin/usuarios?error=" + encodeURIComponent("Informe o e-mail"));
  }

  const contactResult = parseUserContactAddressForm(formData, email);
  if (!contactResult.success) {
    redirect(
      "/admin/usuarios?error=" +
        encodeURIComponent(contactResult.error.issues[0]?.message || "Contato inválido"),
    );
  }
  const contact = userContactAddressData(contactResult.data);

  const tempPassword =
    String(formData.get("tempPassword") || "").trim() || generateTemporaryPassword();
  const check = validateStrongPassword(tempPassword);
  if (!check.ok) {
    redirect("/admin/usuarios?error=" + encodeURIComponent(check.errors[0]!));
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error || !data.user) {
    redirect(
      "/admin/usuarios?error=" +
        encodeURIComponent(error?.message || "Falha ao criar usuário"),
    );
  }

  let workspaceId = existingWorkspaceId;
  if (workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) {
      redirect("/admin/usuarios?error=" + encodeURIComponent("Workspace inválido"));
    }
  } else {
    const { createWorkspace } = await import("@/lib/auth/workspace");
    const ws = await createWorkspace({ name: workspaceName, plan, maxAccounts });
    workspaceId = ws.id;
  }

  await prisma.appUser.upsert({
    where: { id: data.user.id },
    create: {
      id: data.user.id,
      email,
      name,
      role,
      mustChangePassword: true,
      active: true,
      createdById: admin.id,
      workspaceId: workspaceId!,
      ...contact,
    },
    update: {
      email,
      name,
      role,
      mustChangePassword: true,
      active: true,
      workspaceId: workspaceId!,
      ...contact,
    },
  });

  revalidatePath("/admin/usuarios");
  redirect(
    `/admin/usuarios?created=1&email=${encodeURIComponent(email)}&temp=${encodeURIComponent(tempPassword)}`,
  );
}

export async function adminUpdateUserContact(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) {
    redirect("/admin/usuarios?error=" + encodeURIComponent("Usuário inválido"));
  }

  const profile = await prisma.appUser.findUnique({ where: { id } });
  if (!profile) {
    redirect("/admin/usuarios?error=" + encodeURIComponent("Usuário não encontrado"));
  }

  const contactResult = parseUserContactAddressForm(formData, profile.email);
  if (!contactResult.success) {
    redirect(
      "/admin/usuarios?error=" +
        encodeURIComponent(contactResult.error.issues[0]?.message || "Contato inválido"),
    );
  }

  await prisma.appUser.update({
    where: { id },
    data: userContactAddressData(contactResult.data),
  });

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios?contactUpdated=1");
}

export async function adminUpdateWorkspacePlan(formData: FormData) {
  await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") || "");
  const planRaw = String(formData.get("plan") || "ESSENTIAL");
  const plan = planRaw === "PRO" ? "PRO" : "ESSENTIAL";
  const maxAccountsRaw = Number(formData.get("maxAccounts") || (plan === "PRO" ? 10 : 1));
  const maxAccounts = plan === "ESSENTIAL" ? 1 : Math.max(1, maxAccountsRaw || 10);
  if (!workspaceId) {
    redirect("/admin/usuarios?error=" + encodeURIComponent("Workspace inválido"));
  }
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { plan, maxAccounts },
  });
  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios?planUpdated=1");
}

export async function adminToggleUser(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "1";
  if (!id) return;
  await prisma.appUser.update({ where: { id }, data: { active } });
  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}

export async function adminResetTempPassword(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const profile = await prisma.appUser.findUnique({ where: { id } });
  if (!profile) {
    redirect("/admin/usuarios?error=" + encodeURIComponent("Usuário não encontrado"));
  }

  const tempPassword = generateTemporaryPassword();
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(id, {
    password: tempPassword,
  });
  if (error) {
    redirect("/admin/usuarios?error=" + encodeURIComponent(error.message));
  }

  await prisma.appUser.update({
    where: { id },
    data: { mustChangePassword: true },
  });

  revalidatePath("/admin/usuarios");
  redirect(
    `/admin/usuarios?reset=1&email=${encodeURIComponent(profile.email)}&temp=${encodeURIComponent(tempPassword)}`,
  );
}
