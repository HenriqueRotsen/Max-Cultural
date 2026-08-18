import { prisma } from "@/lib/db";
import { normalizeCgccpf } from "@/lib/format";

/** Marcador legado em RelatedParty.notes (não usado para novos vínculos). */
export const CORPORATE_MAP_NOTE = "mapa-societario";

/** Membros do mapa com documento, por conta (deduplica por CPF/CNPJ). */
export async function listCorporateMapMembers(accountIds: string[]) {
  if (!accountIds.length) return [];

  const accounts = await prisma.salicAccount.findMany({
    where: { id: { in: accountIds } },
    select: {
      id: true,
      cgccpf: true,
      corporatePeriods: {
        include: { members: true },
      },
    },
  });

  const out: Array<{
    salicAccountId: string;
    name: string;
    cgccpf: string;
    personType: "PF" | "PJ" | "MEI";
  }> = [];

  for (const account of accounts) {
    const selfDigits = normalizeCgccpf(account.cgccpf);
    const byDoc = new Map<string, (typeof out)[number]>();
    for (const period of account.corporatePeriods) {
      for (const m of period.members) {
        const digits = normalizeCgccpf(m.cgccpf);
        if (digits.length !== 11 && digits.length !== 14) continue;
        if (digits === selfDigits) continue;
        byDoc.set(digits, {
          salicAccountId: account.id,
          name: m.name,
          cgccpf: digits,
          personType: m.personType,
        });
      }
    }
    out.push(...byDoc.values());
  }
  return out;
}

/** @deprecated use listCorporateMapMembers */
export const listCorporateMapBondMembers = listCorporateMapMembers;
