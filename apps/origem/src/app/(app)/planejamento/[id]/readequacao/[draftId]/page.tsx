import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ReadequacaoEditor } from "@/components/planning/ReadequacaoEditor";
import { getWorkspaceContext } from "@/lib/auth/session";
import { canReadequacao } from "@/lib/planning/acl";
import { prisma } from "@/lib/db";
import type { ReadequacaoSnapshot } from "@/lib/planning/readequacao";

export const dynamic = "force-dynamic";

export default async function ReadequacaoDraftPage({
  params,
}: {
  params: Promise<{ id: string; draftId: string }>;
}) {
  const { id, draftId } = await params;
  if (!(await canReadequacao())) {
    redirect(`/planejamento/${id}`);
  }
  const { entitlements } = await getWorkspaceContext();

  const draft = await prisma.planningReadequacaoDraft.findFirst({
    where: {
      id: draftId,
      planningProjectId: id,
      workspaceId: entitlements.workspaceId,
    },
    include: {
      planningProject: { select: { externalCode: true, name: true } },
    },
  });
  if (!draft) notFound();

  if (draft.expiresAt < new Date() && draft.status === "OPEN") {
    await prisma.planningReadequacaoDraft.update({
      where: { id: draft.id },
      data: { status: "EXPIRED" },
    });
  }

  const expired = draft.expiresAt < new Date() || draft.status === "EXPIRED";
  const snap = draft.snapshotJson as unknown as ReadequacaoSnapshot;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href={`/planejamento/${id}`}>
              {draft.planningProject.externalCode}
            </Link>{" "}
            / Readequação
          </>
        }
        title="Readequação de planilha"
        description={
          expired
            ? "Este rascunho expirou (retenção de 24h)."
            : "Monte a planilha para envio. A versão oficial no projeto só entra via SALIC."
        }
      />
      {expired ? (
        <div className="card p-5 text-sm text-[var(--gray-500)]">
          Rascunho expirado.{" "}
          <Link href={`/planejamento/${id}`} className="text-[var(--gold)] hover:underline">
            Voltar ao projeto
          </Link>
        </div>
      ) : (
        <ReadequacaoEditor
          draftId={draft.id}
          planningProjectId={id}
          initialSnapshot={snap}
          expiresAt={draft.expiresAt.toISOString()}
          source={draft.source}
        />
      )}
    </div>
  );
}
