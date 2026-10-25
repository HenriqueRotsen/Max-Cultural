import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ensureProjectRuleset,
  setProjectRulesetManual,
} from "@/lib/compliance/choose-ruleset";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { getWorkspaceContext } = await import("@/lib/auth/session");
    const { entitlements } = await getWorkspaceContext();

    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
      rulesetVersion?: string;
      action?: "set" | "refresh-brief" | "ensure" | "rechoose";
      rationale?: string;
    };

    if (!body.projectId) {
      return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: {
        id: body.projectId,
        salicAccount: { workspaceId: entitlements.workspaceId },
      },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    if (body.action === "set") {
      if (!body.rulesetVersion) {
        return NextResponse.json({ error: "rulesetVersion obrigatório" }, { status: 400 });
      }
      await setProjectRulesetManual({
        projectId: project.id,
        rulesetVersion: body.rulesetVersion,
        rationale: body.rationale,
      });
      // Atualiza briefing mantendo a IN manual
      await ensureProjectRuleset(project.id, { forceBriefRefresh: true });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "refresh-brief") {
      await ensureProjectRuleset(project.id, { forceBriefRefresh: true });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "rechoose") {
      const result = await ensureProjectRuleset(project.id, { forceRechoose: true });
      return NextResponse.json({ ok: true, result });
    }

    // ensure / choose
    const result = await ensureProjectRuleset(project.id);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
