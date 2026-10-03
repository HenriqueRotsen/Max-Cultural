import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { grantedIdsFromRoleRows, normalizeGrantedIds } from "@max/auth";
import { UserAccessEditor } from "@/components/UserAccessEditor";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const u = await prisma.user.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: u ? `Acessos · ${u.name}` : "Acessos" };
}

export default async function UsuarioAcessosPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getSessionUser();
  if (!actor || !can(actor, "cultural.usuarios", "view")) redirect("/");
  const canEdit = can(actor, "cultural.usuarios", "edit");
  const { id } = await params;
  const sp = await searchParams;
  const saved = sp.saved === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  const target = await prisma.user.findUnique({
    where: { id },
    include: {
      role: { include: { permissions: true } },
      permissions: true,
    },
  });
  if (!target) notFound();

  const roleGranted = normalizeGrantedIds(
    grantedIdsFromRoleRows(target.role.permissions),
  );
  const initialOverrides = target.permissions.map((p) => ({
    screen: p.screen,
    effect: p.effect as "GRANT" | "DENY",
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/usuarios"
          className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]"
        >
          ← Usuários
        </Link>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">
          Acessos · {target.name}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--gray-500)]">
          {target.email} · papel padrão{" "}
          <Link
            href={`/papeis/${target.roleId}`}
            className="font-medium text-[var(--navy)] underline-offset-2 hover:underline"
          >
            {target.role.name}
          </Link>
          . Ajustes aqui valem só para esta pessoa (Cultural, Origem e Fluxo via SSO).
        </p>
      </div>

      {error ? <p className="auth-alert">{error}</p> : null}
      {saved ? (
        <p className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]">
          Acessos salvos. A sessão desta pessoa foi encerrada — será preciso entrar de
          novo.
        </p>
      ) : null}

      {target.isSuperAdmin ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm text-[var(--gray-600)]">
          Este usuário é superadmin e tem acesso total. Overrides por pessoa não se
          aplicam.
        </p>
      ) : (
        <UserAccessEditor
          userId={target.id}
          userName={target.name}
          roleName={target.role.name}
          canEdit={canEdit}
          roleGranted={roleGranted}
          initialOverrides={initialOverrides}
        />
      )}
    </div>
  );
}
