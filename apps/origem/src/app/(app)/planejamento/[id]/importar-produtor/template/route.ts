import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { buildProducerSheetTemplate } from "@/lib/planning/producer-sheet";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { entitlements } = await getWorkspaceContext();

  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    include: {
      sheet: {
        include: {
          lines: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!project?.sheet) notFound();

  const buffer = buildProducerSheetTemplate(
    project.sheet.lines.map((l) => ({
      itemName: l.itemName,
      stageName: l.stageName,
      productName: l.productName,
    })),
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-produtor-${project.externalCode}.xlsx"`,
    },
  });
}
