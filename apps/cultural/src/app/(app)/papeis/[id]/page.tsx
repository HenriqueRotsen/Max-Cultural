import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { grantedIdsFromRoleRows, normalizeGrantedIds } from "@max/auth";
import { RoleAccessEditor } from "@/components/RoleAccessEditor";
import { RoleMetaPanel } from "@/components/RoleMetaPanel";

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
  const renamed = sp.renamed === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  const role = await prisma.role.findUnique({
    where: { id },
    include: { permissions: true, _count: { select: { users: true } } },
  });
  if (!role) notFound();

  const initialGranted = normalizeGrantedIds(
    grantedIdsFromRoleRows(role.permissions),
  );

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
        <p className="mt-1 max-w-2xl text-sm text-[var(--gray-500)]">
          {role.description ||
            "Defina entrada no produto, acesso a telas e funcionalidades específicas. Só aparecem ações que existem de fato."}
          {role._count.users > 0
            ? ` · ${role._count.users} usuário${role._count.users === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>

      {error ? <p className="auth-alert">{error}</p> : null}
      {!canEdit ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--gray-600)]">
          Você pode consultar este papel, mas não alterá-lo. É necessária a permissão{" "}
          <strong className="text-[var(--navy)]">Gerenciar papéis e acessos</strong>{" "}
          (ou perfil administrador).
        </p>
      ) : null}
      {renamed ? (
        <p className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]">
          Nome e descrição atualizados.
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]">
          Acessos salvos. As sessões dos {role._count.users} usuário
          {role._count.users === 1 ? "" : "s"} deste papel foram encerradas — será
          preciso entrar de novo.
        </p>
      ) : null}

      <RoleMetaPanel
        roleId={role.id}
        name={role.name}
        description={role.description}
        userCount={role._count.users}
        isSystem={role.isSystem}
        canEdit={canEdit}
      />

      <RoleAccessEditor
        roleId={role.id}
        roleName={role.name}
        canEdit={canEdit}
        initialGranted={initialGranted}
      />
    </div>
  );
}
