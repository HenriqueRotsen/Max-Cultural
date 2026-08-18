import Link from "next/link";
import { prisma } from "@/lib/db";
import { decryptCredential } from "@/lib/crypto";
import { formatCgccpf } from "@/lib/format";
import { getActiveRules, getPendingRulesetReview } from "@/lib/compliance/rules";
import { getWorkspaceContext } from "@/lib/auth/session";
import { accountLimitMessage } from "@/lib/auth/entitlements";
import { AccountEditor } from "@/components/AccountEditor";
import { CreateAccountForm } from "@/components/CreateAccountForm";
import { FieldHelp } from "@/components/FieldHelp";
import { PageHeader } from "@/components/ui";
import { HELP } from "@/lib/help";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ContasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { entitlements } = await getWorkspaceContext();
  const [accounts, rules, pendingReview] = await Promise.all([
    prisma.salicAccount.findMany({
      where: { workspaceId: entitlements.workspaceId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { projects: true } },
      },
    }),
    getActiveRules(),
    getPendingRulesetReview(),
  ]);

  const atLimit = accounts.length >= entitlements.maxAccounts;
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const tab =
    tabParam === "nova" || tabParam === "suas-contas"
      ? tabParam
      : accounts.length > 0
        ? "suas-contas"
        : "nova";

  const created = sp.created === "1";
  const updated = sp.updated === "1";
  const passwordCleared = sp.passwordCleared === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Início › Contas"
        title="Contas SALIC"
        description={`Plano ${entitlements.planLabel}: até ${entitlements.maxAccounts} conta${entitlements.maxAccounts === 1 ? "" : "s"}${entitlements.syncEnabled ? " · sync SALIC incluso" : " · sem sync SALIC"}. Regras: ${rules.sourceCode}.`}
      />

      {pendingReview && (
        <div
          className="rounded-xl border border-[#e5d3bb] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--navy)]"
          role="status"
        >
          <span className="inline-flex flex-wrap items-center gap-1.5">
            As regras oficiais mudaram ({pendingReview.sourceCode} · {pendingReview.version}).
            Revise os percentuais antes de usá-las nos avisos.
            <FieldHelp text={HELP.pendingNorm} />
          </span>
        </div>
      )}

      <nav className="accounts-tabs" aria-label="Abas de contas">
        <Link
          href="/contas?tab=suas-contas"
          aria-current={tab === "suas-contas" ? "page" : undefined}
        >
          Suas contas{accounts.length > 0 ? ` (${accounts.length})` : ""}
        </Link>
        {!atLimit && (
          <Link href="/contas?tab=nova" aria-current={tab === "nova" ? "page" : undefined}>
            Nova conta
          </Link>
        )}
      </nav>

      {error && (
        <div className="rounded-xl border border-[#e5d3bb] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--navy)]">
          {error}
        </div>
      )}

      {created && (
        <div
          className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]"
          role="status"
        >
          Conta cadastrada com sucesso. Ela já aparece em <strong>Suas contas</strong>.
        </div>
      )}
      {updated && (
        <div
          className="rounded-xl border border-[#b7e0c4] bg-[#e8f6ee] px-4 py-3 text-sm text-[#176b3a]"
          role="status"
        >
          Conta atualizada com sucesso.
        </div>
      )}
      {passwordCleared && (
        <div
          className="rounded-xl border border-[var(--border)] bg-[var(--navy-soft)] px-4 py-3 text-sm text-[var(--navy)]"
          role="status"
        >
          Senha removida do Salink. Para atualizar pela área logada do SALIC, cadastre a senha de novo.
        </div>
      )}

      {tab === "nova" ? (
        atLimit ? (
          <div className="card p-5 text-sm text-[var(--gray-600)]">
            {accountLimitMessage(entitlements.maxAccounts)}{" "}
            <Link href="/contato" className="font-semibold text-[var(--navy)] underline">
              Falar sobre o plano Pro
            </Link>
            .
          </div>
        ) : (
          <CreateAccountForm syncEnabled={entitlements.syncEnabled} />
        )
      ) : (
        <div className="space-y-4">
          {accounts.length === 0 ? (
            <div className="card p-5 text-sm text-[var(--gray-500)]">
              Nenhuma conta cadastrada ainda.{" "}
              <Link href="/contas?tab=nova" className="font-semibold text-[var(--navy)] underline">
                Adicionar a primeira conta
              </Link>
              .
            </div>
          ) : (
            accounts.map((account) => (
              <AccountEditor
                key={account.id}
                syncEnabled={entitlements.syncEnabled}
                account={{
                  id: account.id,
                  name: account.name,
                  cgccpf: formatCgccpf(account.cgccpf),
                  salicUsername: decryptCredential(account.salicUsernameEnc),
                  hasPassword: Boolean(account.salicPasswordEnc),
                  extraPronacs: account.extraPronacs,
                  personType: account.personType,
                  active: account.active,
                  projectCount: account._count.projects,
                  institutionalMap: account.institutionalMap,
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
