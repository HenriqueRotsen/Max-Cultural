import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { NfUploadForm } from "@/components/planning/NfUploadForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AnexarNfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: commitmentId } = await params;
  const { entitlements } = await getWorkspaceContext();

  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id: commitmentId, workspaceId: entitlements.workspaceId },
    include: {
      planningProject: { select: { id: true, externalCode: true } },
      engagement: {
        select: {
          service: {
            select: { name: true, supplier: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!commitment?.nfPending || commitment.status !== "PAID") notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${commitment.planningProject.id}`}>
              {commitment.planningProject.externalCode}
            </Link>{" "}
            /{" "}
            <Link href={`/planejamento/compromissos/${commitmentId}`}>
              Compromisso
            </Link>{" "}
            / Anexar NF
          </>
        }
        title="Anexar NF/RPA ao pagamento"
        description={`${commitment.engagement.service.supplier.name} · ${formatCurrency(Number(commitment.amount))} · pagamento já registrado`}
      />
      <NfUploadForm
        planningProjectId={commitment.planningProject.id}
        attachCommitmentId={commitmentId}
      />
    </div>
  );
}
