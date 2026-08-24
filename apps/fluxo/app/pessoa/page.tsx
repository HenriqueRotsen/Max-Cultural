import { PessoaCpfSearch } from "@/components/pessoa/pessoa-cpf-search";
import { SiteShell } from "@/components/app-header";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

export const metadata = {
  title: `Consultar CPF · ${appName}`,
  description: "Veja oficinas, seleção e acompanhamento vinculados a um CPF.",
};

export default function PessoaIndexPage() {
  return (
    <SiteShell width="3xl" mainClassName="pb-16 pt-8 md:pt-16">
      <div className="text-center">
        <h1 className="mt-3 font-heading text-[clamp(2rem,6vw,3rem)] font-semibold tracking-tight text-brand-deep">
          Consultar percurso do candidato
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
          Digite o CPF para ver projetos, oficinas, seleção e uma análise do
          acompanhamento.
        </p>
      </div>

      <div className="mt-10 rounded-2xl border border-brand/10 bg-white/90 p-6 shadow-sm md:p-8">
        <PessoaCpfSearch />
      </div>
    </SiteShell>
  );
}
