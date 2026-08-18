import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "SigaCultural";

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-deep text-white">
      <div className="absolute inset-0">
        <Image
          src="/hero-cultural.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="sc-kenburns object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(18,42,32,0.88)_0%,rgba(18,42,32,0.62)_42%,rgba(18,42,32,0.28)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(90,140,100,0.25)_0%,transparent_55%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-6 pb-16 pt-10 md:pb-24 md:pt-16">
          <div className="max-w-2xl">
            <h1 className="sc-fade-up">
              <span className="sr-only">{appName}</span>
              <Image
                src="/logo-wordmark.png"
                alt=""
                width={855}
                height={164}
                priority
                className="h-auto w-full max-w-[min(100%,28rem)] md:max-w-[34rem]"
              />
            </h1>
            <div className="sc-brand-underline mt-4 h-1 w-24 rounded-full bg-[oklch(0.78_0.09_145)]" />
            <p className="sc-fade-up-delay mt-6 max-w-md text-base leading-relaxed text-white/80 md:text-lg">
              Acompanhe oficinas culturais com a base PRONAC padronizada — do
              formulário à análise do lote.
            </p>
            <div className="sc-fade-up-delay-2 mt-8">
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-[oklch(0.78_0.09_145)] text-brand-deep hover:bg-[oklch(0.84_0.08_145)]",
                )}
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
