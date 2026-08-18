import { prisma } from "@/lib/db";
import { getActiveRules } from "@/lib/compliance/rules";
import type { ActiveRules } from "@/lib/compliance/defaults";
import type { PersonTypeInput, RelatedPartyInput } from "@/lib/compliance/rouanet";
import {
  enabledDocsForRuleset,
  loadObservadoBondsForAccounts,
} from "@/lib/compliance/bonds";
import { normalizeCgccpf } from "@/lib/format";

export type AccountBondRow = {
  cgccpf: string;
  rulesetVersion: string;
  enabled: boolean;
};

export type AccountComplianceMeta = {
  personType: PersonTypeInput;
  /** Vínculos on/off por IN (ObservadoBond). */
  bonds: AccountBondRow[];
};

export async function loadComplianceBundle(
  accountIds?: string[],
  options?: { workspaceId?: string },
) {
  const accounts = await prisma.salicAccount.findMany({
    where: accountIds?.length
      ? { id: { in: accountIds } }
      : options?.workspaceId
        ? { workspaceId: options.workspaceId }
        : undefined,
    select: { id: true, personType: true, cgccpf: true },
  });
  const ids = accounts.map((a) => a.id);

  const [rules, bondsByAccount] = await Promise.all([
    getActiveRules(),
    loadObservadoBondsForAccounts(ids),
  ]);

  const byAccountId = new Map<string, AccountComplianceMeta>();
  for (const a of accounts) {
    byAccountId.set(a.id, {
      personType: a.personType,
      bonds: bondsByAccount.get(a.id) || [],
    });
  }

  return { rules, byAccountId };
}

/** Observados com vínculo ligado sob a IN do projeto → input da soma art. 23. */
export function relatedPartiesForRuleset(
  meta: AccountComplianceMeta | undefined,
  rulesetVersion: string | null | undefined,
  nameByDoc?: Map<string, string>,
): RelatedPartyInput[] {
  const docs = enabledDocsForRuleset(meta?.bonds, rulesetVersion);
  return Array.from(docs).map((cgccpf) => ({
    cgccpf,
    name: nameByDoc?.get(cgccpf) || cgccpf,
    countsTowardProponentCap: true as const,
  }));
}

export function metaForAccount(
  bundle: Awaited<ReturnType<typeof loadComplianceBundle>>,
  accountId?: string | null,
  rulesetVersion?: string | null,
  nameByDoc?: Map<string, string>,
): {
  rules: ActiveRules;
  personType?: PersonTypeInput;
  relatedParties: RelatedPartyInput[];
  bonds: AccountBondRow[];
} {
  if (!accountId) {
    return { rules: bundle.rules, relatedParties: [], bonds: [] };
  }
  const meta = bundle.byAccountId.get(accountId);
  const version = rulesetVersion || bundle.rules.version;
  return {
    rules: bundle.rules,
    personType: meta?.personType,
    relatedParties: relatedPartiesForRuleset(meta, version, nameByDoc),
    bonds: meta?.bonds || [],
  };
}

export function isBondEnabled(
  bonds: AccountBondRow[] | undefined,
  cgccpf: string,
  rulesetVersion: string | null | undefined,
): boolean {
  if (!rulesetVersion) return false;
  const dig = normalizeCgccpf(cgccpf);
  return (bonds || []).some(
    (b) => b.enabled && b.rulesetVersion === rulesetVersion && b.cgccpf === dig,
  );
}
