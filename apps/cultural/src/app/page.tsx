import Link from "next/link";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { can, getSessionUser, needs2faSetup, needsPasswordChange } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    if (needsPasswordChange(user)) redirect("/onboarding/senha");
    if (needs2faSetup(user)) redirect("/onboarding/2fa");

    const origem = (process.env.NEXT_PUBLIC_ORIGEM_URL || "http://localhost:3001").replace(/\/$/, "");
    const fluxo = (process.env.NEXT_PUBLIC_FLUXO_URL || "http://localhost:3002").replace(/\/$/, "");
    const showOrigem = can(user, "origem.app", "view");
    const showFluxo = can(user, "fluxo.app", "view");

    return (
      <div className="shell">
        <AppSidebar
          userEmail={user.email}
          canUsers={can(user, "cultural.usuarios", "view")}
          canRoles={can(user, "cultural.papeis", "view")}
          canLogs={can(user, "cultural.logs", "view")}
        />
        <div className="shell-main">
          <div className="content space-y-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
                Suíte
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Olá, {user.name}</h1>
              <p className="mt-1 text-sm text-[var(--gray-500)]">
                Escolha o produto ou abra o resumo dos projetos no hub.
              </p>
            </div>
            <Link
              href="/projetos"
              className="card block p-5 transition hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
                Hub
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--navy)]">Projetos</p>
              <p className="mt-1 text-sm text-[var(--gray-600)]">
                Resumo, saldos e atalhos rápidos para cada projeto.
              </p>
            </Link>
            <div className="grid gap-4 sm:grid-cols-2">
              {showOrigem ? (
                <a href={`${origem}/painel`} className="card p-5 transition hover:shadow-md">
                  <img
                    src="/brand/max-origem.png"
                    alt="MAX Origem"
                    className="mb-4 h-12 w-auto max-w-[220px] object-contain object-left"
                  />
                  <p className="text-sm text-[var(--gray-600)]">
                    Auditoria SALIC e banco de fornecedores.
                  </p>
                </a>
              ) : null}
              {showFluxo ? (
                <a href={`${fluxo}/dashboard`} className="card p-5 transition hover:shadow-md">
                  <img
                    src="/brand/max-fluxo.png"
                    alt="MAX Fluxo"
                    className="mb-4 h-12 w-auto max-w-[220px] object-contain object-left"
                  />
                  <p className="text-sm text-[var(--gray-600)]">
                    Inscrições, análise e território.
                  </p>
                </a>
              ) : null}
              {!showOrigem && !showFluxo ? (
                <p className="text-sm text-[var(--gray-500)]">
                  Seu papel ainda não libera Origem nem Fluxo. Fale com o administrador.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05050b]">
      <img
        src="/brand/wallpaper.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <h1 className="sr-only">MAX Cultural</h1>
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pb-[14vh] pt-10">
        <img
          src="/brand/max-cultural-on-dark.png"
          alt="MAX Cultural"
          width={1553}
          height={564}
          className="h-auto w-[min(82vw,28rem)] drop-shadow-[0_8px_32px_rgba(0,0,0,0.45)] sm:w-[min(70vw,34rem)]"
        />
        <Link
          href="/login"
          className="btn btn-gold mt-10 px-10 py-3 text-base tracking-wide sm:mt-12"
        >
          Fazer login
        </Link>
      </div>
    </div>
  );
}
