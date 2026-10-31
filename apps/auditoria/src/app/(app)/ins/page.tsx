import { getWorkspaceContext } from "@/lib/auth/session";
import { hasHubPermission } from "@/lib/auth/hub-permissions";
import { PageHeader } from "@/components/ui";
import { RulesetsManager } from "@/components/RulesetsManager";
import { loadRulesetCards } from "@/lib/rulesets/cards";
import { RULESET_EDIT_PERMISSION } from "@/lib/rulesets/form";

export const dynamic = "force-dynamic";

export default async function InsPage() {
  const { entitlements } = await getWorkspaceContext();
  const [rulesets, canEdit] = await Promise.all([
    loadRulesetCards(entitlements.workspaceId),
    hasHubPermission(RULESET_EDIT_PERMISSION),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="INs"
        description="As instruções normativas usadas nas análises e os limites de cada uma, em % do valor captado."
      />
      <RulesetsManager rulesets={rulesets} canEdit={canEdit} />
    </div>
  );
}
