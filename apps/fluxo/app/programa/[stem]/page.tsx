import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { programaStem } from "@/lib/programa";

type Props = {
  params: Promise<{ stem: string }>;
};

/** Redireciona /programa/[stem] legado para /contexto/[id]. */
export default async function ProgramaRedirectPage({ params }: Props) {
  const { stem: stemRaw } = await params;
  const stem = decodeURIComponent(stemRaw).trim();

  const contextos = await prisma.contexto.findMany({
    select: { id: true, nome: true },
  });
  const match = contextos.find(
    (c) => programaStem(c.nome) === stem || c.id === stem,
  );

  if (match) {
    redirect(`/contexto/${encodeURIComponent(match.id)}`);
  }

  redirect("/dashboard/analise");
}
