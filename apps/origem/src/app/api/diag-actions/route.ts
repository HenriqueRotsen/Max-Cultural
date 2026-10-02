import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function describe(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 12) };
  }
  return { message: String(error) };
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const out: Record<string, unknown> = {};
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["lib/actions", () => import("@/lib/actions")],
    ["lib/planning/actions", () => import("@/lib/planning/actions")],
    ["auth/workspace", () => import("@/lib/auth/workspace")],
  ];
  for (const [name, load] of steps) {
    try {
      const mod = (await load()) as Record<string, unknown>;
      out[name] = { ok: true, exports: Object.keys(mod).length };
    } catch (error) {
      out[name] = { ok: false, ...describe(error) };
    }
  }
  try {
    const { assertCanCreateAccount } = await import("@/lib/auth/workspace");
    await assertCanCreateAccount(session.entitlements);
    out.assertCanCreateAccount = { ok: true };
  } catch (error) {
    out.assertCanCreateAccount = { ok: false, ...describe(error) };
  }
  try {
    const { createAccount } = await import("@/lib/actions");
    const fd = new FormData();
    fd.set("name", "X");
    fd.set("cgccpf", "37087503000156");
    await createAccount(fd);
    out.createAccount = { ok: true };
  } catch (error) {
    const digest = (error as { digest?: string })?.digest;
    out.createAccount = { digest, ...describe(error) };
  }
  return NextResponse.json(out);
}
