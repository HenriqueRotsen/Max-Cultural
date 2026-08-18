import type { Metadata } from "next";
import { getPessoaByCpfAction } from "@/app/actions/pessoa";
import { SiteShell } from "@/components/app-header";
import { PessoaView } from "@/components/pessoa/pessoa-view";
import { PessoaCpfSearch } from "@/components/pessoa/pessoa-cpf-search";
import { normalizeCpf } from "@/lib/normalize";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "SigaCultural";

type Props = {
  params: Promise<{ cpf: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cpf: raw } = await params;
  const result = await getPessoaByCpfAction(raw);
  if (!result.ok) {
    return { title: `CPF · ${appName}` };
  }
  return {
    title: `${result.pessoa.nome} · ${appName}`,
    description: `Histórico de oficinas e análise de ${result.pessoa.nome}`,
  };
}

export default async function PessoaCpfPage({ params }: Props) {
  const { cpf: raw } = await params;
  const cpf = normalizeCpf(raw);
  const result = await getPessoaByCpfAction(cpf);

  return (
    <SiteShell width="5xl" mainClassName="pb-20">
      {result.ok ? (
        <PessoaView pessoa={result.pessoa} />
      ) : (
        <div className="mx-auto max-w-lg space-y-6 py-10 text-center">
          <h1 className="font-heading text-2xl font-semibold text-brand-deep">
            CPF não encontrado
          </h1>
          <p className="text-sm text-muted-foreground">{result.error}</p>
          <div className="rounded-2xl border border-brand/10 bg-white/90 p-6 text-left shadow-sm">
            <PessoaCpfSearch initial={raw} />
          </div>
        </div>
      )}
    </SiteShell>
  );
}
