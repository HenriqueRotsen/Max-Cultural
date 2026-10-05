import Link from "next/link";
import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createRoleAction, deleteRoleAction } from "@/lib/actions/iam";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export const metadata = { title: "Papéis" };
export const dynamic = "force-dynamic";

export default async function PapeisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.papeis", "view")) redirect("/");
  const canEdit = can(user, "cultural.papeis", "edit");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const deleted = sp.deleted === "1";
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true, permissions: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Papéis</h1>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Cada papel agrupa usuários. Os acessos às telas e produtos são definidos na página do
          papel.
        </p>
      </div>

      {error ? <p className="auth-alert">{error}</p> : null}
      {deleted ? (
        <p className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]">
          Papel excluído.
        </p>
      ) : null}

      {canEdit ? (
        <form action={createRoleAction} className="card flex flex-wrap items-end gap-3 p-5">
          <div className="field">
            <label htmlFor="name">Novo papel</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="description">Descrição</label>
            <input id="description" name="description" />
          </div>
          <ConfirmSubmitButton className="btn" message="Criar este papel?" confirmLabel="Criar">
            Criar papel
          </ConfirmSubmitButton>
        </form>
      ) : null}

      <section className="card overflow-hidden">
        {roles.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--gray-500)]">Nenhum papel cadastrado.</p>
        ) : (
          <table className="data w-full text-sm">
            <thead>
              <tr>
                <th>Papel</th>
                <th>Usuários</th>
                <th>Acessos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td>
                    <p className="font-medium text-[var(--navy)]">{role.name}</p>
                    {role.description ? (
                      <p className="text-xs text-[var(--gray-500)]">{role.description}</p>
                    ) : null}
                    {role.isSystem ? (
                      <p className="text-[10px] uppercase tracking-wide text-[var(--gray-400)]">
                        Sistema
                      </p>
                    ) : null}
                  </td>
                  <td>{role._count.users}</td>
                  <td>{role._count.permissions}</td>
                  <td className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link href={`/papeis/${role.id}`} className="btn btn-ghost">
                        {canEdit ? "Editar" : "Ver acessos"}
                      </Link>
                      {canEdit && !role.isSystem && role._count.users === 0 ? (
                        <form action={deleteRoleAction} className="inline">
                          <input type="hidden" name="roleId" value={role.id} />
                          <ConfirmSubmitButton
                            className="btn btn-ghost text-xs text-[#b42318]"
                            message={`Excluir o papel “${role.name}”?`}
                            confirmLabel="Excluir"
                          >
                            Excluir
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
