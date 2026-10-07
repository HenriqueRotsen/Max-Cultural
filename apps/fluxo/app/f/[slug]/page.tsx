import type { Metadata } from "next";
import { getPublicFormularioBySlugAction } from "@/app/actions/formularios";
import { PublicFormClient } from "@/components/formularios/public-form-client";
import { recaptchaSiteKey } from "@/lib/recaptcha";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicFormularioBySlugAction(slug);
  if (!result.ok) {
    return { title: "Formulário" };
  }
  return { title: result.form.titulo };
}

export default async function PublicFormularioPage({ params }: { params: Params }) {
  const { slug } = await params;
  const result = await getPublicFormularioBySlugAction(slug);

  if (!result.ok) {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Formulário indisponível</h1>
          <p className="mt-2 text-slate-600">{result.error}</p>
        </main>
      </div>
    );
  }

  const { form } = result;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <main>
        <PublicFormClient
          slug={form.slug}
          titulo={form.titulo}
          descricao={form.descricao}
          capaUrl={form.capaUrl}
          mensagemConfirmacao={form.mensagemConfirmacao}
          campos={form.campos}
          recaptchaSiteKey={recaptchaSiteKey()}
        />
      </main>
    </div>
  );
}
