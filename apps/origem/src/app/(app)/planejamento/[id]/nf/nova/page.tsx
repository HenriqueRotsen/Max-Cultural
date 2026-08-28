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
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> / NF-RPA
          </>
        }
        title="Subir NF ou RPA"
        description="Primeiro escolha o tipo do documento; depois envie o arquivo para extrair os dados."
      />
      <NfUploadForm planningProjectId={id} />
    </div>
  );
}
