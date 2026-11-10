import { prisma } from "@/lib/db";
import { getActiveRules } from "@/lib/compliance/rules";
import type { ActiveRules } from "@/lib/compliance/defaults";
import type { PersonTypeInput, RelatedPartyInput } from "@/lib/compliance/rouanet";
import { loadEnabledBondDocsForProjects } from "@/lib/compliance/bonds";

export type AccountComplianceMeta = {
  personType: PersonTypeInput;
};

/**
 * Tipo de pessoa dos proponentes + vínculos ligados de cada PRONAC deles.
 * O vínculo vale só para o PRONAC em que foi marcado (ProjectObservadoBond).
 */
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
    select: { id: true, personType: true, projects: { select: { id: true } } },
  });

  const projectIds = accounts.flatMap((a) => a.projects.map((p) => p.id));
  const [rules, bondsByProject] = await Promise.all([
    getActiveRules(),
    loadEnabledBondDocsForProjects(projectIds),
  ]);

  const byAccountId = new Map<string, AccountComplianceMeta>();
  for (const a of accounts) byAccountId.set(a.id, { personType: a.personType });

  return { rules, byAccountId, bondsByProject };
}

/** Observados com vínculo ligado neste PRONAC → input da soma do vínculo. */
export function relatedPartiesForDocs(
  docs: Set<string> | undefined,
  nameByDoc?: Map<string, string>,
): RelatedPartyInput[] {
  return Array.from(docs || []).map((cgccpf) => ({
    cgccpf,
    name: nameByDoc?.get(cgccpf) || cgccpf,
    countsTowardProponentCap: true as const,
  }));
}

/** Tipo de pessoa do proponente + quem tem vínculo neste PRONAC. */
export function metaForProject(
  bundle: Awaited<ReturnType<typeof loadComplianceBundle>>,
  accountId: string | null | undefined,
  projectId: string | null | undefined,
  nameByDoc?: Map<string, string>,
): {
  rules: ActiveRules;
  personType?: PersonTypeInput;
  relatedParties: RelatedPartyInput[];
} {
  const meta = accountId ? bundle.byAccountId.get(accountId) : undefined;
  return {
    rules: bundle.rules,
    personType: meta?.personType,
    relatedParties: projectId
      ? relatedPartiesForDocs(bundle.bondsByProject.get(projectId), nameByDoc)
      : [],
  };
}
