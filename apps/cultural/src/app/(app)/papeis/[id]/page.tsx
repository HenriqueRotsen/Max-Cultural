import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SCREENS } from "@/lib/screens";
import { saveRolePermissionsAction } from "@/lib/actions/iam";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const role = await prisma.role.findUnique({ where: { id }, select: { name: true } });
  return { title: role ? `Acessos · ${role.name}` : "Acessos" };
}

export default async function PapelAcessosPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.papeis", "view")) redirect("/");
  const canEdit = can(user, "cultural.papeis", "edit");
  const { id } = await params;
  const sp = await searchParams;
  const saved = sp.saved === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  const role = await prisma.role.findUnique({
    where: { id },
    include: { permissions: true, _count: { select: { users: true } } },
  });
  if (!role) notFound();

  const map = new Map(role.permissions.map((p) => [p.screen, p]));
  const groups = [...new Set(SCREENS.map((s) => s.group))];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/papeis"
          className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]"
        >
          ← Papéis
        </Link>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">
          Acessos · {role.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          {role.description || "Defina o que este papel pode ver e editar em cada tela."}
          {role._count.users > 0
            ? ` · ${role._count.users} usuário${role._count.users === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>

      {error ? <p className="auth-alert">{error}</p> : null}
      {saved ? (
        <p className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]">
          Acessos salvos.
        </p>
      ) : null}

      <form action={saveRolePermissionsAction} className="card overflow-hidden">
        <input type="hidden" name="roleId" value={role.id} />
        {groups.map((group) => (
          <div key={group}>
            <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-3">
              <h2 className="text-sm font-semibold text-[var(--navy)]">{group}</h2>
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
                {SCREENS.filter((s) => s.group === group).map((screen) => {
                  const perm = map.get(screen.id);
                  return (
                    <tr key={screen.id}>
                      <td>{screen.label}</td>
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
          </div>
        ))}
        {canEdit ? (
          <div className="px-5 py-4">
            <ConfirmSubmitButton
              className="btn"
              message={`Salvar acessos de ${role.name}?`}
              confirmLabel="Salvar"
            >
              Salvar acessos
            </ConfirmSubmitButton>
          </div>
        ) : null}
      </form>
    </div>
  );
}
