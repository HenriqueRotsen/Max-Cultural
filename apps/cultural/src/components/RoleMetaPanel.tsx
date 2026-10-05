import { deleteRoleAction, updateRoleAction } from "@/lib/actions/iam";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

type Props = {
  roleId: string;
  name: string;
  description: string;
  userCount: number;
  isSystem: boolean;
  canEdit: boolean;
};

export function RoleMetaPanel({
  roleId,
  name,
  description,
  userCount,
  isSystem,
  canEdit,
}: Props) {
  if (!canEdit) return null;

  const canDelete = !isSystem && userCount === 0;

  return (
    <section className="card space-y-5 p-5">
      <div>
        <h2 className="text-sm font-semibold text-[var(--navy)]">Identificação</h2>
        <p className="mt-1 text-xs text-[var(--gray-500)]">
          Nome exibido na lista de usuários e nos filtros.
        </p>
      </div>

      <form action={updateRoleAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="roleId" value={roleId} />
        <div className="field min-w-[12rem] flex-1">
          <label htmlFor="role-name">Nome</label>
          <input id="role-name" name="name" required defaultValue={name} />
        </div>
        <div className="field min-w-[16rem] flex-[2]">
          <label htmlFor="role-description">Descrição</label>
          <input id="role-description" name="description" defaultValue={description} />
        </div>
        <ConfirmSubmitButton className="btn" message="Salvar nome e descrição deste papel?">
          Salvar
        </ConfirmSubmitButton>
      </form>

      <div className="border-t border-[var(--gray-200)] pt-4">
        <h2 className="text-sm font-semibold text-[var(--navy)]">Excluir papel</h2>
        {isSystem ? (
          <p className="mt-1 text-xs text-[var(--gray-500)]">
            Papéis marcados como sistema não podem ser removidos.
          </p>
        ) : userCount > 0 ? (
          <p className="mt-1 text-xs text-[var(--gray-500)]">
            Há {userCount} usuário{userCount === 1 ? "" : "s"} com este papel. Transfira-os
            para outro papel antes de excluir.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-[var(--gray-500)]">
              Remove o papel e convites pendentes associados. Esta ação não pode ser desfeita.
            </p>
            <form action={deleteRoleAction} className="mt-3">
              <input type="hidden" name="roleId" value={roleId} />
              <ConfirmSubmitButton
                className="btn btn-ghost text-[#b42318] hover:bg-[#fef3f2]"
                message={`Excluir permanentemente o papel “${name}”?`}
                confirmLabel="Excluir"
              >
                Excluir papel
              </ConfirmSubmitButton>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
