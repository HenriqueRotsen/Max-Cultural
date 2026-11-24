import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { NfUploadForm } from "@/components/planning/NfUploadForm";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { creditLeftForCommitment } from "@/lib/planning/credits-view";

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
  if (!commitment) notFound();
  const paidWithoutNf = commitment.nfPending && commitment.status === "PAID";
  const reservedWithoutNf =
    commitment.status === "RESERVED" &&
    !commitment.pedidoId &&
    (await prisma.documentRubricAllocation.count({ where: { commitmentId } })) === 0;
  if (!paidWithoutNf && !reservedWithoutNf) notFound();
  const creditLeft = paidWithoutNf
    ? ((await creditLeftForCommitment(commitmentId, entitlements.workspaceId)) ?? Number(commitment.amount))
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/compromissos/${commitmentId}`}
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
        title={paidWithoutNf ? "Anexar NF/RPA ao pagamento" : "Anexar NF/RPA à reserva"}
        description={
          paidWithoutNf
            ? `${commitment.engagement.service.supplier.name} · crédito sem nota: ${formatCurrency(creditLeft ?? 0)}. A nota pode ser menor: o resto continua como crédito para as próximas.`
            : `${commitment.engagement.service.supplier.name} · ${formatCurrency(Number(commitment.amount))} · reservado, ainda sem nota`
        }
      />
      <NfUploadForm
        planningProjectId={commitment.planningProject.id}
        attachCommitmentId={commitmentId}
      />
    </div>
  );
}
