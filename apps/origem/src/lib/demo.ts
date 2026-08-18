import { isDemoMode } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

/** Hash estável → ~10% dos ids (resto 10 === 0). */
export function demoKeepId(id: string, every = 10): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % every === 0;
}

/** Mantém ~10% dos itens por id; se a amostra vier vazia, fica com ceil(10%). */
export function sampleById<T extends { id: string }>(items: T[], every = 10): T[] {
  if (!isDemoMode() || items.length === 0) return items;
  const kept = items.filter((item) => demoKeepId(item.id, every));
  if (kept.length > 0) return kept;
  return items.slice(0, Math.max(1, Math.ceil(items.length * (1 / every))));
}

/**
 * Escopo Prisma: só projetos da amostra demo (~10%).
 * Sem demo → objeto vazio (sem filtro extra).
 */
export async function demoProjectWhere(workspaceId?: string): Promise<
  | { id: { in: string[] } }
  | Record<string, never>
> {
  if (!isDemoMode()) return {};

  const projects = await prisma.project.findMany({
    where: workspaceId ? { salicAccount: { workspaceId } } : undefined,
    select: { id: true },
  });
  const ids = sampleById(projects).map((p) => p.id);
  if (ids.length === 0) {
    return { id: { in: ["__demo_empty__"] } };
  }
  return { id: { in: ids } };
}

export function assertNotDemo(actionLabel = "Esta ação"): void {
  if (isDemoMode()) {
    throw new Error(`${actionLabel} não está disponível no modo demonstração.`);
  }
}
