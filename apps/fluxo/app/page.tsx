import Link from "next/link";

export default function HomePage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--navy)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(0,179,176,0.16),transparent_34%),radial-gradient(circle_at_18%_82%,rgba(13,92,99,0.08),transparent_38%)]" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-6 pb-16 pt-10 md:pb-24 md:pt-16">
          <div className="max-w-2xl">
            <h1>
              <span className="sr-only">{appName}</span>
              <img
                src="/brand/max-fluxo.png"
                alt={appName}
                width={1668}
                height={645}
                className="h-auto w-full max-w-[min(100%,20rem)] bg-transparent object-contain object-left md:max-w-[24rem]"
              />
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--gray-500)] md:text-lg">
              Acompanhe oficinas culturais com a base PRONAC padronizada — do
              formulário à análise do lote.
            </p>
            <div className="mt-8">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-[10px] bg-[var(--navy)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Entrar no painel
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
