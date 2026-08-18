import Link from "next/link";
import { redirect } from "next/navigation";
import { MaxCulturalLogo } from "@/components/BrandLogo";
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
                Escolha o produto. O acesso segue o papel configurado neste hub.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {showOrigem ? (
                <a href={origem} className="card p-5 transition hover:shadow-md">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">
                    Criação · Planejamento · Auditoria
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-[var(--navy)]">MAX Origem</h2>
                  <p className="mt-2 text-sm text-[var(--gray-600)]">
                    Auditoria SALIC e banco de fornecedores.
                  </p>
                </a>
              ) : null}
              {showFluxo ? (
                <a href={fluxo} className="card p-5 transition hover:shadow-md">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">
                    Execução · Gestão · Acompanhamento
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-[var(--navy)]">MAX Fluxo</h2>
                  <p className="mt-2 text-sm text-[var(--gray-600)]">
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
    <div
      className="relative min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url(/brand/wallpaper.png)" }}
    >
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <MaxCulturalLogo className="brightness-0 invert" />
          <Link href="/login" className="btn btn-gold">
            Entrar
          </Link>
        </header>
        <main className="flex flex-1 flex-col justify-center py-16 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
            Suíte cultural
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight">
            Origem e Fluxo no mesmo acesso, com 2FA.
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/80">
            Hub de identidade da suíte MAX. Sem página de preços — o acesso é combinado com o
            cliente.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-gold">
              Entrar
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
