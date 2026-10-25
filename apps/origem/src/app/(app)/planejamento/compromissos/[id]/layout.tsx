import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/** Reserva de projeto encerrado também some do Origem. */
export default async function CommitmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const commitment = await prisma.rubricCommitment.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { planningProject: { select: { closedAt: true } } },
  });
  if (!commitment || commitment.planningProject.closedAt) notFound();
  return children;
}
