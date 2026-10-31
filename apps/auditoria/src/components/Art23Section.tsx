"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { setObservadoBonds } from "@/lib/actions";
import { formatCgccpf, formatCurrency } from "@/lib/format";
import { Section } from "@/components/ui";
import { HELP } from "@/lib/help";
import { actionErrorMessage } from "@/lib/action-errors";

export type Art23Row = {
  cgccpf: string;
  name: string;
  /** Valor que conta para o limite (sem alimentação/refeição). */
  amount: number;
  enabled: boolean;
};

function pct(part: number, total: number) {
  if (!total || total <= 0) return 0;
  return (part / total) * 100;
}

function pctLabel(value: number) {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

/**
 * Parte 1 do detalhe do PRONAC: soma do art. 23 (proponente + quem tem vínculo)
 * e a marcação de vínculo de cada observado, salva em lote.
 */
export function Art23Section({
  step,
  salicAccountId,
  rulesetVersion,
  rulesetSourceCode,
  accountName,
  proponentAmount,
  projectTotal,
  limitPct,
  nearPct,
  noLimits = false,
  bondRelations = [],
  artisticGroupException = false,
  rows,
}: {
  step: number;
  salicAccountId: string | null;
  rulesetVersion: string;
  rulesetSourceCode: string;
  accountName: string;
  proponentAmount: number;
  projectTotal: number;
  limitPct: number;
  /** A partir daqui conta como "perto do limite" (regra da IN). */
  nearPct: number;
  /** IN sem limites percentuais: mostra a soma, sem teto. */
  noLimits?: boolean;
  /** Tipos de relação que a IN conta como vínculo (rótulos já traduzidos). */
  bondRelations?: string[];
  artisticGroupException?: boolean;
  rows: Art23Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const isOn = (r: Art23Row) => (draft.has(r.cgccpf) ? draft.get(r.cgccpf) === true : r.enabled);
  const sum = proponentAmount + rows.filter(isOn).reduce((s, r) => s + r.amount, 0);
  const sumPct = pct(sum, projectTotal);
  const over = !noLimits && sumPct > limitPct;
  const near = !noLimits && !over && sumPct >= nearPct;
  const barPct = Math.min(100, limitPct > 0 ? (sumPct / limitPct) * 100 : 0);

  function toggle(r: Art23Row, next: boolean) {
    setError(null);
    setSavedMsg(null);
    setDraft((cur) => {
      const copy = new Map(cur);
      if (next === r.enabled) copy.delete(r.cgccpf);
      else copy.set(r.cgccpf, next);
      return copy;
    });
  }

  function save() {
    if (!draft.size || !salicAccountId) return;
    setError(null);
    const changes = Array.from(draft, ([cgccpf, on]) => ({ cgccpf, enabled: on }));
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof setObservadoBonds>>;
      try {
        result = await setObservadoBonds({ salicAccountId, rulesetVersion, changes });
      } catch (err) {
        setError(actionErrorMessage(err, "Não foi possível salvar."));
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(new Map());
      setSavedMsg(
        changes.length === 1 ? "Vínculo salvo." : `${changes.length} vínculos salvos.`,
      );
      router.refresh();
    });
  }

  return (
    <Section
      step={step}
      tone="highlight"
      title="Limite do art. 23"
      help={HELP.art23}
      description={
        noLimits ? (
          <>
            Soma do que o proponente e as pessoas ou empresas ligadas a ele receberam
            neste projeto. A {rulesetSourceCode} não define limite percentual, então
            a soma aparece só para consulta.
          </>
        ) : (
          <>
            Soma do que o proponente e as pessoas ou empresas ligadas a ele receberam
            neste projeto. Pela {rulesetSourceCode}, essa soma pode chegar a no máximo{" "}
            <strong className="font-semibold text-[var(--navy)]">{limitPct}% do valor captado</strong>.
            Alimentação e refeição não entram.
          </>
        )
      }
    >
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-base text-[var(--gray-600)]">
              Soma atual{draft.size ? " (prévia, ainda não salva)" : ""}:{" "}
              <strong
                className={`text-xl font-semibold ${over ? "text-[#b42318]" : "text-[var(--navy)]"}`}
              >
                {pctLabel(sumPct)}
              </strong>{" "}
              <span className="text-[var(--gray-500)]">
                {noLimits ? "do valor captado" : `de ${limitPct}% permitido`} · {formatCurrency(sum)}
              </span>
            </p>
            <span
              className={`badge ${noLimits ? "badge-muted" : over ? "badge-danger" : near ? "badge-attention" : "badge-success"}`}
            >
              {noLimits
                ? "Sem limite na IN"
                : over
                  ? "Acima do limite"
                  : near
                    ? "Perto do limite"
                    : "Dentro do limite"}
            </span>
          </div>
          {noLimits ? null : (
          <div
            className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--gray-100)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={limitPct}
            aria-valuenow={Number(sumPct.toFixed(2))}
            aria-label="Soma do art. 23 em relação ao limite"
          >
            <div
              className={`h-full rounded-full ${over ? "bg-[#d92d20]" : near ? "bg-[#f59e0b]" : "bg-[#16a34a]"}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          )}
        </div>

        {rows.length > 0 ? (
          <div className="rounded-xl border border-[var(--gold-border)] bg-[var(--gold-soft)] px-4 py-3 text-[0.95rem] text-[var(--navy)]">
            <p>
              <strong className="font-semibold">Lembrete da {rulesetSourceCode}:</strong>{" "}
              {bondRelations.length
                ? "tem vínculo com o proponente quem for"
                : "esta IN não lista tipos de vínculo."}
            </p>
            {bondRelations.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {bondRelations.map((rel) => (
                  <li
                    key={rel}
                    className="rounded-full border border-[var(--gold-border)] bg-white px-3 py-1 text-sm font-medium text-[var(--navy)]"
                  >
                    {rel}
                  </li>
                ))}
              </ul>
            ) : null}
            {artisticGroupException ? (
              <p className="mt-1 text-sm text-[var(--gray-600)]">
                Grupo artístico familiar ou coletivo previsto na IN não conta.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Quem recebeu</th>
                <th>Valor que conta</th>
                <th>% do captado</th>
                <th className="text-right">Tem vínculo?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="font-semibold text-[var(--navy)]">{accountName}</span>
                  <div className="text-sm text-[var(--gray-500)]">Proponente — sempre conta</div>
                </td>
                <td className="font-semibold text-[var(--navy)]">
                  {proponentAmount > 0 ? formatCurrency(proponentAmount) : "—"}
                </td>
                <td>{proponentAmount > 0 ? pctLabel(pct(proponentAmount, projectTotal)) : "—"}</td>
                <td className="text-right text-sm text-[var(--gray-500)]">Proponente</td>
              </tr>
              {rows.map((r) => {
                const on = isOn(r);
                const changed = draft.has(r.cgccpf);
                return (
                  <tr key={r.cgccpf} className={changed ? "bg-[var(--gold-soft)]" : undefined}>
                    <td>
                      <span className="font-semibold text-[var(--navy)]">{r.name}</span>
                      <div className="text-sm text-[var(--gray-500)]">
                        Observado · {formatCgccpf(r.cgccpf)}
                      </div>
                    </td>
                    <td className={on ? "font-semibold text-[var(--navy)]" : "text-[var(--gray-400)]"}>
                      {r.amount > 0 ? formatCurrency(r.amount) : "—"}
                    </td>
                    <td className={on ? undefined : "text-[var(--gray-400)]"}>
                      {r.amount > 0 ? pctLabel(pct(r.amount, projectTotal)) : "—"}
                    </td>
                    <td className="text-right">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                        <span className={on ? "font-medium text-[var(--navy)]" : "text-[var(--gray-500)]"}>
                          {on ? "Sim" : "Não"}
                          {changed ? " · não salvo" : ""}
                        </span>
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-[var(--navy)]"
                          checked={on}
                          disabled={pending || !salicAccountId}
                          onChange={(e) => toggle(r, e.target.checked)}
                          aria-label={`${r.name} tem vínculo com o proponente`}
                        />
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? (
          <p className="text-[0.95rem] text-[var(--gray-500)]">
            Nenhum observado recebeu neste PRONAC. Para acompanhar alguém, cadastre em
            Cadastros › Observados.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto text-[0.95rem] text-[var(--gray-500)]" aria-live="polite">
              {draft.size
                ? `${draft.size} alteração${draft.size === 1 ? "" : "ões"} não salva${draft.size === 1 ? "" : "s"}. O vínculo vale para todos os PRONACs de ${accountName} nesta IN.`
                : savedMsg || "Marque quem tem vínculo com o proponente e clique em Salvar."}
            </p>
            {draft.size ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => setDraft(new Map())}
              >
                Descartar
              </button>
            ) : null}
            <button type="button" className="btn" disabled={!draft.size || pending} onClick={save}>
              Salvar
            </button>
          </div>
        )}
        {error ? <p className="text-sm text-[#8a4b12]">{error}</p> : null}
      </div>

      {pending && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
              role="presentation"
            >
              <div
                role="alertdialog"
                aria-modal="true"
                aria-live="assertive"
                className="flex w-full max-w-xs items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-xl"
              >
                <span
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--navy)]"
                  aria-hidden
                />
                <div>
                  <div className="text-base font-semibold text-[var(--navy)]">Salvando…</div>
                  <div className="text-sm text-[var(--gray-500)]">
                    Aplicando os vínculos e atualizando os PRONACs.
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </Section>
  );
}
