"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RELATION_HINTS, RELATION_LABELS, type RelationKind } from "@/lib/compliance/defaults";
import {
  BOND_RELATION_GROUPS,
  emptyRulesetForm,
  validateRulesetForm,
  type RulesetFormValues,
} from "@/lib/rulesets/form";
import { deleteRuleset, rulesetUsage, saveRuleset } from "@/lib/rulesets/actions";
import { actionErrorMessage } from "@/lib/action-errors";

export type RulesetCard = {
  id: string;
  sourceCode: string;
  sourceUrl: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isDefault: boolean;
  noPercentLimits: boolean;
  proponentCapPct: number;
  proponentMeiCapPct: number;
  supplierCapPct: number;
  relations: RelationKind[];
  notes: string;
  projectCount: number;
  form: RulesetFormValues;
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function pct(n: number) {
  return `${String(n).replace(".", ",")}%`;
}

/** Aba "INs" de Observados: lista, cadastro (assistente), edição e exclusão. */
export function RulesetsManager({ rulesets, canEdit }: { rulesets: RulesetCard[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<RulesetFormValues | null>(null);
  const [deleting, setDeleting] = useState<RulesetCard | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[0.95rem] text-[var(--gray-600)]">
          Cada IN define os limites do art. 23 (proponente) e do art. 24 (fornecedor) e
          quem conta como vínculo. Os PRONACs usam a IN da época em que foram executados.
        </p>
        {canEdit ? (
          <button type="button" className="btn" onClick={() => setEditing(emptyRulesetForm())}>
            + Nova IN
          </button>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--gray-50)] px-4 py-3 text-[0.95rem] text-[var(--gray-600)]">
          Somente consulta. Para cadastrar, editar ou excluir INs é preciso a permissão
          “Cadastrar e editar INs” no MAX Cultural.
        </p>
      ) : null}

      {flash ? (
        <p
          className="rounded-xl border border-[#b7e4c7] bg-[#ecfbf1] px-4 py-3 text-[0.95rem] text-[#146c3a]"
          role="status"
        >
          {flash}
        </p>
      ) : null}

      {rulesets.length === 0 ? (
        <p className="text-[0.95rem] text-[var(--gray-500)]">Nenhuma IN cadastrada.</p>
      ) : (
        <ul className="space-y-3">
          {rulesets.map((r) => (
            <li key={r.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--navy)]">
                    {r.sourceUrl ? (
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:underline"
                        title="Abrir o texto da IN"
                      >
                        {r.sourceCode} ↗
                      </a>
                    ) : (
                      r.sourceCode
                    )}
                    {r.isDefault ? <span className="badge badge-success">Padrão</span> : null}
                    {r.noPercentLimits ? (
                      <span className="badge badge-muted">Sem limites percentuais</span>
                    ) : null}
                  </h3>
                  <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                    {r.effectiveTo
                      ? `Vigência de ${fmtDate(r.effectiveFrom)} a ${fmtDate(r.effectiveTo)}`
                      : `Vigente desde ${fmtDate(r.effectiveFrom)}`}
                    {" · "}
                    {r.projectCount === 1 ? "1 PRONAC usa" : `${r.projectCount} PRONACs usam`}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing(r.form)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost text-[#b42318]"
                      onClick={() => setDeleting(r)}
                    >
                      Excluir
                    </button>
                  </div>
                ) : null}
              </div>

              {r.noPercentLimits ? (
                <p className="mt-3 text-[0.95rem] text-[var(--gray-600)]">
                  Esta IN não define limites percentuais: nenhum teto é avaliado nos PRONACs
                  que a usam.
                </p>
              ) : (
                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    { label: "Proponente (empresa)", value: r.proponentCapPct },
                    { label: "Proponente (PF/MEI)", value: r.proponentMeiCapPct },
                    { label: "Por fornecedor", value: r.supplierCapPct },
                  ].map((x) => (
                    <div key={x.label} className="rounded-lg bg-[var(--gray-50)] px-3 py-2">
                      <dt className="text-sm text-[var(--gray-500)]">{x.label}</dt>
                      <dd className="text-lg font-semibold text-[var(--navy)]">até {pct(x.value)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-3">
                <p className="text-sm font-semibold text-[var(--gray-500)]">Contam como vínculo</p>
                {r.relations.length ? (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.relations.map((rel) => (
                      <li
                        key={rel}
                        className="rounded-full border border-[var(--border)] bg-[var(--gray-50)] px-3 py-1 text-sm text-[var(--gray-600)]"
                      >
                        {RELATION_LABELS[rel]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-[var(--gray-500)]">Nenhum tipo marcado.</p>
                )}
              </div>
              {r.notes ? <p className="mt-2 text-sm text-[var(--gray-500)]">{r.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <RulesetWizard
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setFlash(msg);
          }}
        />
      ) : null}
      {deleting ? (
        <DeleteRulesetDialog
          ruleset={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(msg) => {
            setDeleting(null);
            setFlash(msg);
          }}
        />
      ) : null}
    </div>
  );
}

/* ——— Janela (popup) ——— */

function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  busy,
  dismissible = true,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  busy?: boolean;
  /** false: só fecha pelos botões (formulário com dados que se perderiam). */
  dismissible?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && dismissible) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy, dismissible]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={() => {
        if (!busy && dismissible) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--navy)]">{title}</h2>
          {subtitle ? <div className="mt-1 text-[0.95rem] text-[var(--gray-600)]">{subtitle}</div> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--gray-50)] px-6 py-3">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ——— Assistente de cadastro / edição ——— */

const STEPS = ["Identificação", "Limites", "Vínculos", "Revisar"] as const;

function RulesetWizard({
  initial,
  onClose,
  onSaved,
}: {
  initial: RulesetFormValues;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial.id);
  const [values, setValues] = useState<RulesetFormValues>(initial);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof RulesetFormValues>(key: K, value: RulesetFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
  }

  /** Valida só até o passo atual — os próximos ainda não foram preenchidos. */
  function stepError(upTo: number) {
    const err = validateRulesetForm(values);
    return err && err.step <= upTo + 1 ? err : null;
  }

  function next() {
    const err = stepError(step);
    if (err) {
      setError(err.message);
      setStep(err.step - 1);
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function save() {
    const err = validateRulesetForm(values);
    if (err) {
      setError(err.message);
      setStep(err.step - 1);
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveRuleset(values);
        if (!result.ok) {
          setError(result.error);
          if (result.step) setStep(result.step - 1);
          return;
        }
        onSaved(isEdit ? `${values.sourceCode} atualizada.` : `${values.sourceCode} cadastrada.`);
        router.refresh();
      } catch (e) {
        setError(actionErrorMessage(e, "Não foi possível salvar."));
      }
    });
  }

  return (
    <Modal
      title={isEdit ? `Editar ${initial.sourceCode}` : "Nova IN"}
      subtitle={`Passo ${step + 1} de ${STEPS.length} · ${STEPS[step]}`}
      onClose={onClose}
      busy={pending}
      dismissible={false}
      footer={
        <>
          {error ? (
            <p className="mr-auto text-sm text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          {step > 0 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={pending}
            >
              Voltar
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn" onClick={next}>
              Continuar
            </button>
          ) : (
            <button type="button" className="btn" onClick={save} disabled={pending}>
              {pending ? "Salvando…" : isEdit ? "Salvar alterações" : "Cadastrar IN"}
            </button>
          )}
        </>
      }
    >
      <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Passos">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              // Na edição dá para pular direto para um passo.
              onClick={() => (isEdit || i < step ? setStep(i) : undefined)}
              className={`w-full rounded-lg border px-2 py-2 text-left text-sm transition ${
                i === step
                  ? "border-[var(--navy)] bg-[var(--navy-soft)] font-semibold text-[var(--navy)]"
                  : i < step
                    ? "border-[var(--border)] text-[var(--navy)]"
                    : "border-[var(--border)] text-[var(--gray-400)]"
              }`}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="block text-xs">Passo {i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <Field label="Nome da IN" hint="Como vai aparecer nas telas e relatórios.">
            <input
              value={values.sourceCode}
              onChange={(e) => set("sourceCode", e.target.value)}
              placeholder="Ex.: IN MinC nº 29/2026"
              autoFocus
            />
          </Field>
          <Field label="Link do texto oficial" hint="Opcional. Ajuda quem consulta a regra.">
            <input
              value={values.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
              placeholder="https://www.gov.br/…"
              inputMode="url"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vale a partir de">
              <input
                type="date"
                value={values.effectiveFrom}
                onChange={(e) => set("effectiveFrom", e.target.value)}
              />
            </Field>
            <Field label="Vale até" hint="Deixe em branco se ainda está valendo.">
              <input
                type="date"
                value={values.effectiveTo}
                onChange={(e) => set("effectiveTo", e.target.value)}
              />
            </Field>
          </div>
          <Check
            checked={values.isDefault}
            onChange={(v) => set("isDefault", v)}
            label="Usar como IN padrão"
            hint="Vale para PRONACs ainda sem IN definida. Só uma IN pode ser a padrão."
          />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Check
            checked={values.noPercentLimits}
            onChange={(v) => set("noPercentLimits", v)}
            label="Esta IN não define limites percentuais"
            hint="Ex.: IN nº 01/2013. Nenhum teto é avaliado nos PRONACs que usam esta IN."
          />
          {values.noPercentLimits ? (
            <p className="rounded-xl bg-[var(--gray-50)] px-4 py-3 text-[0.95rem] text-[var(--gray-600)]">
              Sem limites, os PRONACs desta IN mostram os valores só para consulta, sem
              “acima do limite” ou “perto do limite”.
            </p>
          ) : (
            <>
              <p className="text-[0.95rem] text-[var(--gray-600)]">
                Os limites são em % do valor captado do projeto.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <PctField
                  label="Proponente (empresa)"
                  hint="Soma do art. 23"
                  value={values.proponentCapPct}
                  onChange={(v) => set("proponentCapPct", v)}
                />
                <PctField
                  label="Proponente (PF ou MEI)"
                  hint="Soma do art. 23"
                  value={values.proponentMeiCapPct}
                  onChange={(v) => set("proponentMeiCapPct", v)}
                />
                <PctField
                  label="Por fornecedor"
                  hint="Cada fornecedor"
                  value={values.supplierCapPct}
                  onChange={(v) => set("supplierCapPct", v)}
                />
              </div>
              <details className="more-filters">
                <summary>Artigos citados nos avisos</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Artigo do limite do proponente">
                    <input
                      value={values.proponentArticle}
                      onChange={(e) => set("proponentArticle", e.target.value)}
                      placeholder="art. 23"
                    />
                  </Field>
                  <Field label="Artigo do limite por fornecedor">
                    <input
                      value={values.supplierArticle}
                      onChange={(e) => set("supplierArticle", e.target.value)}
                      placeholder="art. 24"
                    />
                  </Field>
                </div>
              </details>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-[0.95rem] text-[var(--gray-600)]">
            Marque quem, por esta IN, conta como vínculo com o proponente. O que essas
            pessoas ou empresas recebem entra na soma do art. 23.
          </p>
          {BOND_RELATION_GROUPS.map((g) => (
            <fieldset key={g.label}>
              <legend className="mb-2 text-sm font-semibold text-[var(--gray-500)]">{g.label}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.options.map((rel) => (
                  <Check
                    key={rel}
                    compact
                    checked={values.relations.includes(rel)}
                    onChange={(on) =>
                      set(
                        "relations",
                        on ? [...values.relations, rel] : values.relations.filter((x) => x !== rel),
                      )
                    }
                    label={RELATION_LABELS[rel]}
                    hint={RELATION_HINTS[rel]}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <Check
            checked={values.artisticGroupException}
            onChange={(v) => set("artisticGroupException", v)}
            label="Prevê exceção para grupo artístico"
            hint="Grupo artístico familiar ou coletivo previsto na IN não entra no limite do proponente."
          />
          <Field label="Observação" hint="Opcional. Aparece no card da IN.">
            <textarea
              rows={2}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Ex.: cônjuge, companheiro, coligada ou sócio em comum; PF/MEI até 30%."
            />
          </Field>
        </div>
      )}

      {step === 3 && (
        <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          <Review label="Nome">{values.sourceCode || "—"}</Review>
          <Review label="Vigência">
            {values.effectiveTo
              ? `${fmtDate(values.effectiveFrom)} a ${fmtDate(values.effectiveTo)}`
              : `Desde ${fmtDate(values.effectiveFrom)}`}
            {values.isDefault ? " · IN padrão" : ""}
          </Review>
          <Review label="Limites">
            {values.noPercentLimits
              ? "Sem limites percentuais"
              : `Proponente empresa até ${values.proponentCapPct}% · PF/MEI até ${values.proponentMeiCapPct}% · fornecedor até ${values.supplierCapPct}%`}
          </Review>
          <Review label="Contam como vínculo">
            {values.relations.length
              ? values.relations.map((r) => RELATION_LABELS[r]).join(", ")
              : "Nenhum tipo marcado"}
            {values.artisticGroupException ? " · exceção para grupo artístico" : ""}
          </Review>
          {isEdit ? (
            <p className="px-4 py-3 text-sm text-[var(--gray-500)]">
              Ao salvar, os PRONACs que usam esta IN são recalculados.
            </p>
          ) : null}
        </dl>
      )}
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label-row">{label}</span>
      {children}
      {hint ? <span className="text-sm text-[var(--gray-500)]">{hint}</span> : null}
    </label>
  );
}

function PctField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
          className="w-full pr-8"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--gray-500)]">
          %
        </span>
      </div>
    </Field>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
  compact,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 transition ${
        checked ? "border-[var(--navy)] bg-[var(--navy-soft)]" : "border-[var(--border)] hover:bg-[var(--gray-50)]"
      } ${compact ? "py-2" : "py-3"}`}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--navy)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-[0.95rem] font-medium text-[var(--navy)]">{label}</span>
        {hint ? <span className="block text-sm text-[var(--gray-500)]">{hint}</span> : null}
      </span>
    </label>
  );
}

function Review({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm font-semibold text-[var(--gray-500)]">{label}</dt>
      <dd className="text-[0.95rem] text-[var(--navy)]">{children}</dd>
    </div>
  );
}

/* ——— Exclusão com confirmação dupla ——— */

function DeleteRulesetDialog({
  ruleset,
  onClose,
  onDeleted,
}: {
  ruleset: RulesetCard;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [usage, setUsage] = useState<{ projects: number; planning: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    rulesetUsage(ruleset.id)
      .then((u) => alive && setUsage(u))
      .catch(() => alive && setUsage({ projects: ruleset.projectCount, planning: 0 }));
    return () => {
      alive = false;
    };
  }, [ruleset.id, ruleset.projectCount]);

  const matches = typed.trim().toLowerCase() === ruleset.sourceCode.trim().toLowerCase();
  const blocked = (usage?.planning ?? 0) > 0;

  function confirmDelete() {
    startTransition(async () => {
      try {
        const result = await deleteRuleset({ id: ruleset.id, confirmName: typed });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDeleted(
          result.moved > 0
            ? `${ruleset.sourceCode} excluída. ${result.moved} PRONAC(s) receberam outra IN automaticamente.`
            : `${ruleset.sourceCode} excluída.`,
        );
        router.refresh();
      } catch (e) {
        setError(actionErrorMessage(e, "Não foi possível excluir."));
      }
    });
  }

  return (
    <Modal
      title={stage === 1 ? `Excluir ${ruleset.sourceCode}?` : "Confirme a exclusão"}
      subtitle={stage === 1 ? "Etapa 1 de 2" : "Etapa 2 de 2"}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          {error ? (
            <p className="mr-auto text-sm text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          {stage === 1 ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={!usage || blocked}
              onClick={() => setStage(2)}
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              disabled={!matches || pending}
              onClick={confirmDelete}
            >
              {pending ? "Excluindo…" : "Excluir IN"}
            </button>
          )}
        </>
      }
    >
      {stage === 1 ? (
        <div className="space-y-3 text-[0.95rem] text-[var(--gray-600)]">
          <p>A IN some da lista e deixa de ser usada nas análises.</p>
          {!usage ? (
            <p className="text-[var(--gray-500)]">Verificando onde ela é usada…</p>
          ) : blocked ? (
            <p className="rounded-xl border border-[#f5b5ad] bg-[#fef1ef] px-4 py-3 text-[#a12a1c]">
              Não é possível excluir: {usage.planning} projeto(s) do Planejamento no MAX
              Financeiro usam esta IN. Troque a IN desses projetos antes.
            </p>
          ) : usage.projects > 0 ? (
            <p className="rounded-xl border border-[#f6d39a] bg-[#fff7e8] px-4 py-3 text-[#8a4b12]">
              {usage.projects === 1 ? "1 PRONAC usa" : `${usage.projects} PRONACs usam`} esta IN.
              Eles vão receber outra IN automaticamente, escolhida pela época de execução.
            </p>
          ) : (
            <p>Nenhum PRONAC usa esta IN agora.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.95rem] text-[var(--gray-600)]">
            Para confirmar, digite o nome da IN exatamente como abaixo:
          </p>
          <p className="rounded-lg bg-[var(--gray-50)] px-3 py-2 font-semibold text-[var(--navy)]">
            {ruleset.sourceCode}
          </p>
          <label className="field">
            <span className="field-label-row">Nome da IN</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
          </label>
        </div>
      )}
    </Modal>
  );
}
