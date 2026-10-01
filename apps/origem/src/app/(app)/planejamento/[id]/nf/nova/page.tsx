import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { NfUploadForm } from "@/components/planning/NfUploadForm";
import { PendingFiscalDocuments } from "@/components/planning/PendingFiscalDocuments";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NovaNfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    attachCommitmentId?: string;
    attachPedidoId?: string;
  }>;
}) {
  const { id } = await params;
  const { attachCommitmentId, attachPedidoId } = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true, importedAt: true },
  });
  if (!project?.importedAt) notFound();

  const pendingDocs = await prisma.planningDocument.findMany({
    where: {
      planningProjectId: id,
      workspaceId: entitlements.workspaceId,
      kind: { in: ["NF", "RPA"] },
      status: { in: ["REVIEW", "IMPORTED", "FAILED"] },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      filename: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={
          attachPedidoId
            ? `/planejamento/${id}/pedidos/${attachPedidoId}`
            : `/planejamento/${id}`
        }
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${id}`}>{project.externalCode}</Link> / NF-RPA
          </>
        }
        title={attachPedidoId ? "Vincular NF ou RPA ao pedido" : "Subir NF ou RPA"}
        description={
          attachPedidoId
            ? "Envie a nota do valor total do pedido. A reserva já está feita nas parcelas."
            : "Primeiro escolha o tipo do documento; depois envie o arquivo para extrair os dados."
        }
      />
      <PendingFiscalDocuments
        planningProjectId={id}
        documents={pendingDocs}
      />
      <NfUploadForm
        planningProjectId={id}
        attachCommitmentId={attachCommitmentId}
        attachPedidoId={attachPedidoId}
      />
    </div>
  );
}
