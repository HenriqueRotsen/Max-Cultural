import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { NfUploadForm } from "@/components/planning/NfUploadForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NovaNfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true, importedAt: true },
  });
  if (!project?.importedAt) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> / NF
          </>
        }
        title="Subir nota fiscal"
        description="O sistema extrai os dados e, na confirmação, reserva a rubrica e cadastra no módulo Fornecedores."
      />
      <NfUploadForm planningProjectId={id} />
    </div>
  );
}
