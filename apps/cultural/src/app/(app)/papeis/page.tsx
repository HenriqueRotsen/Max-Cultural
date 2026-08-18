import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SCREENS } from "@/lib/screens";
import { createRoleAction, saveRolePermissionsAction } from "@/lib/actions/iam";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export const metadata = { title: "Papéis" };
export const dynamic = "force-dynamic";

export default async function PapeisPage() {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.papeis", "view")) redirect("/");
  const canEdit = can(user, "cultural.papeis", "edit");
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { permissions: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Papéis</h1>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Permissão por tela: visualizar ou editar.
        </p>
      </div>

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

      {roles.map((role) => {
        const map = new Map(role.permissions.map((p) => [p.screen, p]));
        return (
          <form
            key={role.id}
            action={saveRolePermissionsAction}
            className="card overflow-hidden"
          >
            <input type="hidden" name="roleId" value={role.id} />
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="font-semibold text-[var(--navy)]">{role.name}</h2>
              {role.description ? (
                <p className="text-sm text-[var(--gray-500)]">{role.description}</p>
              ) : null}
            </div>
            <table className="data w-full text-sm">
              <thead>
                <tr>
                  <th>Tela</th>
                  <th>Ver</th>
                  <th>Editar</th>
                </tr>
              </thead>
              <tbody>
                {SCREENS.map((screen) => {
                  const perm = map.get(screen.id);
                  return (
                    <tr key={screen.id}>
                      <td>
                        {screen.label}
                        <span className="ml-2 text-[11px] text-[var(--gray-400)]">
                          {screen.group}
                        </span>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          name={`view:${screen.id}`}
                          defaultChecked={Boolean(perm?.canView)}
                          disabled={!canEdit}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          name={`edit:${screen.id}`}
                          defaultChecked={Boolean(perm?.canEdit)}
                          disabled={!canEdit}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {canEdit ? (
              <div className="px-5 py-4">
                <ConfirmSubmitButton
                  className="btn"
                  message={`Salvar permissões de ${role.name}?`}
                  confirmLabel="Salvar"
                >
                  Salvar
                </ConfirmSubmitButton>
              </div>
            ) : null}
          </form>
        );
      })}
    </div>
  );
}
