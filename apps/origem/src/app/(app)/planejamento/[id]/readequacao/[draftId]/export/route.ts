import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { canReadequacao } from "@/lib/planning/acl";
import { prisma } from "@/lib/db";
import {
  exportReadequacaoCsv,
  type ReadequacaoSnapshot,
} from "@/lib/planning/readequacao";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; draftId: string }> },
) {
  const { id, draftId } = await ctx.params;
  if (!(await canReadequacao())) {
    return new Response("Forbidden", { status: 403 });
  }
  const { entitlements } = await getWorkspaceContext();
  const draft = await prisma.planningReadequacaoDraft.findFirst({
    where: {
      id: draftId,
      planningProjectId: id,
      workspaceId: entitlements.workspaceId,
    },
    include: { planningProject: { select: { externalCode: true } } },
  });
  if (!draft) notFound();

  const csv = exportReadequacaoCsv(draft.snapshotJson as unknown as ReadequacaoSnapshot);
  const filename = `readequacao-${draft.planningProject.externalCode}-${draftId.slice(0, 8)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
