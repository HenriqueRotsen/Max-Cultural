import { prisma } from "@/lib/db";
import {
  lockedLineIds,
  type HierarchyLockRecord,
  type LockableLine,
} from "@/lib/planning/hierarchy-lock";

export async function loadHierarchyLocks(
  sheetId: string,
): Promise<HierarchyLockRecord[]> {
  const rows = await prisma.budgetHierarchyLock.findMany({
    where: { sheetId },
    orderBy: { lockedAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    sheetId: r.sheetId,
    level: r.level,
    scopeKey: r.scopeKey,
    fonteRecurso: r.fonteRecurso,
    productName: r.productName,
    stageName: r.stageName,
    state: r.state,
    city: r.city,
    budgetLineId: r.budgetLineId,
  }));
}

export async function loadLockedLineIds(
  sheetId: string,
  lines: LockableLine[],
): Promise<{ locks: HierarchyLockRecord[]; lockedLineIds: Set<string> }> {
  const locks = await loadHierarchyLocks(sheetId);
  return { locks, lockedLineIds: lockedLineIds(lines, locks) };
}
