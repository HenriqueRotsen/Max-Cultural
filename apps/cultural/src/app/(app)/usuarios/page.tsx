import Link from "next/link";
import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  adminResetPasswordAction,
  createUserAction,
  peekUserFlash,
  toggleUserAction,
  updateUserRoleAction,
} from "@/lib/actions/iam";
import { adminReset2faAction } from "@/lib/actions/auth";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

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
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          A primeira senha é temporária (enviada por e-mail). No login o usuário troca a
          senha e confirma um código enviado ao e-mail cadastrado. O papel define o
          padrão; em cada pessoa você pode ajustar acessos com Conceder/Negar.
        </p>
      </div>

      {error ? (
        <p className="auth-alert">{error}</p>
      ) : null}
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
          A senha temporária já foi exibida; se precisar, use &quot;Redefinir senha&quot;.
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
        <form action={createUserAction} className="card space-y-3 p-5">
          <h2 className="font-semibold text-[var(--navy)]">Novo usuário</h2>
          <p className="text-sm text-[var(--gray-500)]">
            Gera e envia por e-mail uma senha temporária. No primeiro acesso o usuário
            troca a senha e confirma o código enviado ao e-mail.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field">
              <label htmlFor="name">Nome</label>
              <input id="name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="roleId">Papel</label>
              <select id="roleId" name="roleId" required defaultValue={roles[0]?.id}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ConfirmSubmitButton
            className="btn"
            message="Criar este usuário e enviar o convite?"
            confirmLabel="Criar"
          >
            Criar
          </ConfirmSubmitButton>
        </form>
      ) : null}

      <section className="card overflow-hidden">
        <table className="data w-full text-sm">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Acessos</th>
              <th>Verificação</th>
              <th>Status</th>
              {canEdit ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  {canEdit ? (
                    <form action={updateUserRoleAction} className="inline-flex items-center gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="roleId"
                        defaultValue={u.roleId}
                        className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-sm"
                        aria-label={`Papel de ${u.name}`}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <ConfirmSubmitButton
                        className="btn btn-ghost"
                        message="Trocar o papel deste usuário? A sessão atual será encerrada."
                      >
                        Salvar
                      </ConfirmSubmitButton>
                    </form>
                  ) : (
                    u.role.name
                  )}
                </td>
                <td>
                  <Link
                    href={`/usuarios/${u.id}`}
                    className="font-medium text-[var(--navy)] underline-offset-2 hover:underline"
                  >
                    {u.isSuperAdmin
                      ? "Total"
                      : u._count.permissions > 0
                        ? `Ajustar (${u._count.permissions})`
                        : "Herdar papel"}
                  </Link>
                </td>
                <td>
                  {u.mustChangePassword ? "Após senha" : "Código por e-mail"}
                </td>
                <td>{u.deactivatedAt ? "Inativo" : "Ativo"}</td>
                {canEdit ? (
                  <td className="space-x-2 whitespace-nowrap">
                    <form action={toggleUserAction.bind(null, u.id)} className="inline">
                      <ConfirmSubmitButton
                        className="btn btn-ghost"
                        message={
                          u.deactivatedAt
                            ? "Reativar este usuário?"
                            : "Desativar este usuário?"
                        }
                      >
                        {u.deactivatedAt ? "Reativar" : "Desativar"}
                      </ConfirmSubmitButton>
                    </form>
                    {u.id !== user.id ? (
                      <>
                        <form
                          action={adminResetPasswordAction.bind(null, u.id)}
                          className="inline"
                        >
                          <ConfirmSubmitButton
                            className="btn btn-ghost"
                            message="Gerar nova senha temporária? A sessão atual do usuário será invalidada e ele deverá trocar a senha no próximo login."
                          >
                            Redefinir senha
                          </ConfirmSubmitButton>
                        </form>
                        <form
                          action={adminReset2faAction.bind(null, u.id)}
                          className="inline"
                        >
                          <ConfirmSubmitButton
                            className="btn btn-ghost"
                            message="Encerrar todas as sessões deste usuário? No próximo acesso ele usará senha e o código enviado por e-mail."
                          >
                            Encerrar sessões
                          </ConfirmSubmitButton>
                        </form>
                      </>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
