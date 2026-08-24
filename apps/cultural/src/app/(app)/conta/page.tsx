import { can, getSessionUser } from "@/lib/auth";
import { is2faDisabled } from "@/lib/totp";
import { AccountProfileForm } from "@/components/AccountProfileForm";

export const metadata = { title: "Minha conta" };
export const dynamic = "force-dynamic";

function formatWhen(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toLocaleString("pt-BR");
}

export default async function ContaPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const twoFa = is2faDisabled()
    ? "Desativado neste ambiente"
    : user.totpEnabled
      ? "Ativo"
      : "Pendente";

  const apps = [
    can(user, "origem.app", "view") ? "MAX Origem" : null,
    can(user, "fluxo.app", "view") ? "MAX Fluxo" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Conta
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Minha conta</h1>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Dados pessoais, senha e informações do seu acesso na suíte MAX.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-[var(--navy)]">Informações</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-400)]">
              E-mail
            </dt>
            <dd className="mt-1 font-medium text-[var(--navy)]">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-400)]">
              Papel
            </dt>
            <dd className="mt-1 font-medium text-[var(--navy)]">
              {user.role.name}
              {user.isSuperAdmin ? (
                <span className="ml-1 text-xs font-normal text-[var(--gray-500)]">
                  (administrador)
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-400)]">
              Verificação em duas etapas
            </dt>
            <dd className="mt-1 font-medium text-[var(--navy)]">{twoFa}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-400)]">
              Produtos
            </dt>
            <dd className="mt-1 font-medium text-[var(--navy)]">
              {apps.length > 0 ? apps.join(" · ") : "Nenhum produto liberado"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-400)]">
              Último login
            </dt>
            <dd className="mt-1 font-medium text-[var(--navy)]">{formatWhen(user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-400)]">
              Conta criada em
            </dt>
            <dd className="mt-1 font-medium text-[var(--navy)]">{formatWhen(user.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <AccountProfileForm name={user.name} />
    </div>
  );
}
