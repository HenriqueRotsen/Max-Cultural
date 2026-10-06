import Link from "next/link";
import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  adminResetPasswordAction,
  peekUserFlash,
  toggleUserAction,
} from "@/lib/actions/iam";
import { adminReset2faAction } from "@/lib/actions/auth";
import { CreateUserForm } from "@/components/CreateUserForm";
import {
  IconConfirmButton,
  IconKeyReset,
  IconLogout,
  IconPower,
} from "@/components/IconConfirmButton";
import { RoleSelect } from "@/components/RoleSelect";
import {
  isProtectedSuperAdminEmail,
  SUPERADMIN_ROLE_NAME,
} from "@/lib/protected-superadmin";
import { recaptchaSiteKey } from "@/lib/recaptcha";

export const metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.usuarios", "view")) redirect("/");
  const canEdit = can(user, "cultural.usuarios", "edit");
  const sp = await searchParams;
  const created = sp.created === "1" || sp.created === "true";
  const passwordReset = sp.passwordReset === "1" || sp.passwordReset === "true";
  const reset2fa = sp.reset2fa === "1" || sp.reset2fa === "true";
  const roleUpdated = sp.roleUpdated === "1" || sp.roleUpdated === "true";
  const error = typeof sp.error === "string" ? sp.error : null;
  const flash =
    created || passwordReset || error ? await peekUserFlash() : null;
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        role: true,
        _count: { select: { permissions: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Usuários</h1>
      </div>

      {error ? <p className="auth-alert">{error}</p> : null}
      {flash ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm">
          {flash.kind === "password_reset"
            ? `Senha temporária gerada para ${flash.email}.`
            : `Usuário ${flash.email} criado.`}{" "}
          Senha temporária (copie agora — some em breve):{" "}
          <strong>{flash.provisional}</strong>
        </p>
      ) : created || passwordReset ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm">
          A senha temporária já foi exibida; se precisar, use o ícone de redefinir senha.
        </p>
      ) : null}
      {reset2fa ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm">
          Sessões encerradas. No próximo login o usuário usará senha e o código por e-mail.
        </p>
      ) : null}
      {roleUpdated ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm">
          Papel atualizado. A sessão do usuário foi encerrada — ele precisa entrar de novo.
        </p>
      ) : null}

      {canEdit ? (
        <CreateUserForm
          siteKey={recaptchaSiteKey()}
          roles={roles
            .filter((r) => r.name !== SUPERADMIN_ROLE_NAME)
            .map((r) => ({ id: r.id, name: r.name }))}
        />
      ) : null}

      <section className="card overflow-x-auto">
        <table className="data w-full min-w-[720px] text-sm">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Acessos</th>
              <th>Status</th>
              {canEdit ? <th className="text-right">Ações</th> : null}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const protectedAdmin = isProtectedSuperAdminEmail(u.email);
              const assignableRoles = roles
                .filter((r) => r.name !== SUPERADMIN_ROLE_NAME)
                .map((r) => ({ id: r.id, name: r.name }));
              return (
              <tr key={u.id}>
                <td className="align-middle font-medium text-[var(--navy)]">{u.name}</td>
                <td className="align-middle text-[var(--gray-600)]">{u.email}</td>
                <td className="align-middle">
                  {canEdit ? (
                    <RoleSelect
                      userId={u.id}
                      roleId={u.roleId}
                      userName={u.name}
                      roles={assignableRoles}
                      locked={protectedAdmin}
                      lockedLabel={SUPERADMIN_ROLE_NAME}
                    />
                  ) : (
                    protectedAdmin ? SUPERADMIN_ROLE_NAME : u.role.name
                  )}
                </td>
                <td className="align-middle">
                  <Link
                    href={`/usuarios/${u.id}`}
                    className="badge inline-flex border border-[var(--border)] bg-[var(--gray-50)] text-[var(--navy)] hover:bg-[var(--navy-soft)]"
                  >
                    {u.isSuperAdmin || protectedAdmin
                      ? "Total"
                      : u._count.permissions > 0
                        ? `Ajustes · ${u._count.permissions}`
                        : "Herdar"}
                  </Link>
                </td>
                <td className="align-middle">
                  <span
                    className={
                      u.deactivatedAt
                        ? "badge badge-danger"
                        : u.mustChangePassword
                          ? "badge badge-warn"
                          : "badge badge-success"
                    }
                  >
                    {u.deactivatedAt
                      ? "Inativo"
                      : u.mustChangePassword
                        ? "Senha temp."
                        : "Ativo"}
                  </span>
                </td>
                {canEdit ? (
                  <td className="align-middle">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {!protectedAdmin ? (
                        <form action={toggleUserAction.bind(null, u.id)}>
                          <IconConfirmButton
                            label={u.deactivatedAt ? "Reativar" : "Desativar"}
                            title={u.deactivatedAt ? "Reativar usuário" : "Desativar usuário"}
                            message={
                              u.deactivatedAt
                                ? "Reativar este usuário?"
                                : "Desativar este usuário?"
                            }
                          >
                            <IconPower />
                          </IconConfirmButton>
                        </form>
                      ) : (
                        <span
                          className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-[var(--gray-50)] px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-500)]"
                          title="Conta Superadmin protegida"
                        >
                          Protegido
                        </span>
                      )}
                      {u.id !== user.id && !protectedAdmin ? (
                        <>
                          <form action={adminResetPasswordAction.bind(null, u.id)}>
                            <IconConfirmButton
                              label="Redefinir senha"
                              title="Redefinir senha"
                              message="Gerar nova senha temporária e enviar por e-mail? A sessão atual será encerrada."
                              confirmLabel="Gerar"
                            >
                              <IconKeyReset />
                            </IconConfirmButton>
                          </form>
                          <form action={adminReset2faAction.bind(null, u.id)}>
                            <IconConfirmButton
                              label="Encerrar sessões"
                              title="Encerrar sessões"
                              message="Encerrar todas as sessões deste usuário?"
                              confirmLabel="Encerrar"
                            >
                              <IconLogout />
                            </IconConfirmButton>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
