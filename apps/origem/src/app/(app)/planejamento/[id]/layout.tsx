import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/** Projeto encerrado some do Origem: todas as telas dele respondem 404. */
export default async function PlanningProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { closedAt: true },
  });
  if (!project || project.closedAt) notFound();
  return children;
}
