import { prisma } from "@/lib/db";
import { formatCgccpf, normalizeCgccpf } from "@/lib/format";

/**
 * Um CNPJ tem um mapa societário só. Quando o observado também é proponente,
 * o mapa é o do proponente (Contas › Mapa) e a página do observado mostra e
 * edita esse mesmo mapa.
 */
export async function findProponentByDoc(doc: string, workspaceId: string) {
  const digits = normalizeCgccpf(doc);
  if (digits.length !== 11 && digits.length !== 14) return null;
  return prisma.salicAccount.findFirst({
    where: { workspaceId, cgccpf: { in: [digits, formatCgccpf(digits)] } },
    select: { id: true, name: true, cgccpf: true, institutionalMap: true, foundedAt: true, foundedAtPrecision: true },
  });
}

/**
 * Se o observado tinha mapa próprio antes de virar proponente: quando o mapa do
 * proponente está vazio, os intervalos passam para ele. Se os dois têm
 * intervalos, nada é apagado e devolve quantos ficaram de fora (a tela avisa).
 */
export async function unifyWatchedMapIntoAccount(watchedId: string, accountId: string) {
  const [own, accountCount] = await Promise.all([
    prisma.corporatePeriod.count({ where: { watchedSupplierId: watchedId } }),
    prisma.corporatePeriod.count({ where: { salicAccountId: accountId } }),
  ]);
  if (own === 0) return { moved: 0, leftover: 0 };
  if (accountCount === 0) {
    const r = await prisma.corporatePeriod.updateMany({
      where: { watchedSupplierId: watchedId },
      data: { salicAccountId: accountId, watchedSupplierId: null },
    });
    return { moved: r.count, leftover: 0 };
  }
  return { moved: 0, leftover: own };
}

/** Observados do workspace que também são proponentes: id do observado → proponente. */
export async function proponentByWatchedId(workspaceId: string) {
  const [watched, accounts] = await Promise.all([
    prisma.watchedSupplier.findMany({
      where: { workspaceId },
      select: { id: true, cgccpf: true, supplier: { select: { cgccpf: true } } },
    }),
    prisma.salicAccount.findMany({
      where: { workspaceId },
      select: { id: true, name: true, cgccpf: true, institutionalMap: true },
    }),
  ]);
  const byDoc = new Map(accounts.map((a) => [normalizeCgccpf(a.cgccpf), a]));
  const out = new Map<string, (typeof accounts)[number]>();
  for (const w of watched) {
    const acc = byDoc.get(normalizeCgccpf(w.cgccpf || w.supplier?.cgccpf || ""));
    if (acc) out.set(w.id, acc);
  }
  return out;
}
