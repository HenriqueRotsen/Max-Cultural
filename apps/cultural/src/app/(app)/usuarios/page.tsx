import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createUserAction, toggleUserAction } from "@/lib/actions/iam";
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
  const createdEmail = typeof sp.email === "string" ? sp.email : null;
  const temp = typeof sp.temp === "string" ? sp.temp : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { role: true },
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

      {error ? (
        <p className="auth-alert">{error}</p>
      ) : null}
      {createdEmail && temp ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm">
          Usuário {createdEmail} criado. Senha provisória: <strong>{temp}</strong>
        </p>
      ) : null}

      {canEdit ? (
        <form action={createUserAction} className="card space-y-3 p-5">
          <h2 className="font-semibold text-[var(--navy)]">Novo usuário</h2>
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
              <th>2FA</th>
              <th>Status</th>
              {canEdit ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role.name}</td>
                <td>{u.totpEnabled ? "Ativo" : "Pendente"}</td>
                <td>{u.deactivatedAt ? "Inativo" : "Ativo"}</td>
                {canEdit ? (
                  <td className="space-x-2">
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
                    <form action={adminReset2faAction.bind(null, u.id)} className="inline">
                      <ConfirmSubmitButton
                        className="btn btn-ghost"
                        message="Resetar o 2FA? O segredo não é enviado por e-mail. O usuário configura de novo no próximo login."
                      >
                        Resetar 2FA
                      </ConfirmSubmitButton>
                    </form>
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
