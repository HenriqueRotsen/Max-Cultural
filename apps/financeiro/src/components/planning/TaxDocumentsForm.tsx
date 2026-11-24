"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SearchSelect } from "@max/ui";
import { MoneyInput } from "@/components/MoneyInput";
import { formatCgccpfInput } from "@/lib/format";
import { PronacOverrideField } from "@/components/planning/PronacOverrideField";
import { uploadTaxDocuments } from "@/lib/planning/tax-actions";
import type { ActionState } from "@/lib/planning/action-state";
import {
  TAX_DOC_TYPES,
  TAX_KIND_LABELS,
  suggestTaxByRubric,
  taxGuideTotal,
  type TaxKind,
  type TaxRubric,
} from "@/lib/planning/tax-docs";

const initial: ActionState = {};
/** Impostos federais: a guia (DARF) vai para a Receita Federal. */
const FEDERAL = new Set(["inss", "irrf", "pis", "cofins", "csll"]);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type TaxPaymentOption = {
  nfId: string;
  label: string;
  hint?: string;
  taxes: Array<{ kind: TaxKind; label: string; amount: number }>;
  /** Impostos que já têm documentos lançados. */
  done: TaxKind[];
  /** Rubricas do pagamento (rateio da NF/RPA). */
  rubrics: TaxRubric[];
};

type Picked = { file: File; url: string };
/** Pagamento coberto pela guia: imposto em cada rubrica (por allocationId). */
type Item = { nfId: string; amounts: Record<string, number | null> };

/** Prévia do arquivo escolhido (PDF ou imagem), antes de enviar. */
function FilePreview({ picked }: { picked: Picked | null }) {
  if (!picked) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-[var(--gray-200)] text-xs text-[var(--gray-500)]">
        Sem arquivo
      </div>
    );
  }
  const { file, url } = picked;
  if (file.type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} className="h-56 w-full rounded-lg border object-contain" />;
  }
  if (file.type === "application/pdf") {
    return <iframe src={url} title={file.name} className="h-56 w-full rounded-lg border" />;
  }
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border text-xs text-[var(--gray-500)]">
      {file.name}
    </div>
  );
}

function retainedOf(p: TaxPaymentOption, kind: string): number {
  return p.taxes.find((t) => t.kind === kind)?.amount ?? 0;
}

function suggested(p: TaxPaymentOption, kind: string): Record<string, number | null> {
  const s = suggestTaxByRubric(p.rubrics, retainedOf(p, kind));
  return Object.fromEntries(p.rubrics.map((r) => [r.allocationId, s[r.allocationId] ?? null]));
}

export function TaxDocumentsForm({
  planningProjectId,
  payments,
  initialNfId,
}: {
  planningProjectId: string;
  payments: TaxPaymentOption[];
  initialNfId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    uploadTaxDocuments.bind(null, planningProjectId),
    initial,
  );
  const byId = new Map(payments.map((p) => [p.nfId, p]));
  const initialPayment = initialNfId ? byId.get(initialNfId) : undefined;
  const [taxKind, setTaxKind] = useState<string>(
    initialPayment?.taxes.find((t) => !initialPayment.done.includes(t.kind))?.kind ??
      initialPayment?.taxes[0]?.kind ??
      "iss",
  );
  const [items, setItems] = useState<Item[]>(
    initialPayment ? [{ nfId: initialPayment.nfId, amounts: suggested(initialPayment, taxKind) }] : [],
  );
  const [files, setFiles] = useState<Record<string, Picked | null>>({});
  const [payeeCnpj, setPayeeCnpj] = useState("");
  function pick(field: string, file: File | null) {
    setFiles((prev) => {
      if (prev[field]) URL.revokeObjectURL(prev[field]!.url);
      return { ...prev, [field]: file ? { file, url: URL.createObjectURL(file) } : null };
    });
  }
  // Depois de lançar, o formulário limpa: arquivos, prévias e pagamentos.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) {
      setFiles({});
      setItems([]);
      setPayeeCnpj("");
    }
  }

  if (payments.length === 0) {
    return (
      <p className="text-sm text-[var(--gray-500)]">
        Nenhum pagamento com nota neste projeto ainda. O imposto é lançado no pagamento de uma NF/RPA.
      </p>
    );
  }

  const label = TAX_KIND_LABELS[taxKind as TaxKind] ?? "Imposto";
  const payload = items.map((it) => ({
    nfId: it.nfId,
    rubricas: Object.entries(it.amounts).map(([allocationId, amount]) => ({ allocationId, amount: amount ?? 0 })),
  }));
  const total = taxGuideTotal(payload);
  const available = payments
    .filter((p) => !items.some((i) => i.nfId === p.nfId))
    .map((p) => ({
      value: p.nfId,
      label: `${p.label}${p.done.includes(taxKind as TaxKind) ? ` · ${label} já lançado` : ""}`,
      hint: p.hint,
    }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <label className="field sm:max-w-xs">
        <span>Imposto</span>
        <SearchSelect
          name="taxKind"
          required
          value={taxKind}
          onValueChange={(v) => {
            setTaxKind(v);
            // Outro imposto: refaz a sugestão com o valor retido dele.
            setItems((prev) => prev.map((it) => ({ nfId: it.nfId, amounts: suggested(byId.get(it.nfId)!, v) })));
          }}
          options={(Object.keys(TAX_KIND_LABELS) as TaxKind[]).map((k) => ({ value: k, label: TAX_KIND_LABELS[k] }))}
          placeholder="Escolha o imposto"
          searchPlaceholder="Buscar imposto…"
          emptyText="Nenhum imposto encontrado."
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            { field: "guiaFile", label: TAX_DOC_TYPES.GUIA },
            { field: "proofFile", label: "Comprovante do imposto" },
          ] as const
        ).map((f) => (
          <div key={f.field} className="flex flex-col gap-2">
            <label className="field">
              <span>{f.label}</span>
              <input
                name={f.field}
                type="file"
                accept=".pdf,image/*"
                required
                onChange={(e) => pick(f.field, e.target.files?.[0] ?? null)}
              />
            </label>
            <FilePreview picked={files[f.field] ?? null} />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="field">
          <span>Número da guia (opcional)</span>
          <input name="guideNumber" placeholder="Ex.: 2026001234" />
        </label>
        <label className="field">
          <span>CNPJ de quem recebe o imposto</span>
          <input
            name="payeeCnpj"
            value={payeeCnpj}
            onChange={(e) => setPayeeCnpj(formatCgccpfInput(e.target.value))}
            placeholder={FEDERAL.has(taxKind) ? "Receita Federal, se vazio" : "CNPJ da prefeitura"}
          />
        </label>
        <label className="field">
          <span>Nome de quem recebe</span>
          <input
            name="payeeName"
            placeholder={FEDERAL.has(taxKind) ? "Receita Federal do Brasil" : "Ex.: Prefeitura de Fortaleza"}
          />
        </label>
      </div>
      <p className="-mt-3 text-xs text-[var(--gray-500)]">
        No SALIC a guia é um lançamento próprio, com quem recebe o imposto como fornecedor. Se o CNPJ
        ficar vazio, o sistema usa o que aparece na guia
        {FEDERAL.has(taxKind) ? " (ou a Receita Federal)" : ""}.
      </p>

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold text-[var(--navy)]">Pagamentos desta guia</h3>
          <p className="text-xs text-[var(--gray-500)]">
            Uma guia pode pagar o imposto de vários pagamentos. Em cada um, diga quanto vai para cada
            rubrica (já vem dividido pelo valor retido na nota).
          </p>
        </div>

        {items.map((it) => {
          const p = byId.get(it.nfId)!;
          const retained = retainedOf(p, taxKind);
          const sum = taxGuideTotal([
            { nfId: it.nfId, rubricas: Object.values(it.amounts).map((a) => ({ allocationId: "", amount: a ?? 0 })) },
          ]);
          const off = retained > 0 && Math.abs(sum - retained) > 0.02;
          return (
            <div key={it.nfId} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--navy)]">{p.label}</p>
                  <p className="text-xs text-[var(--gray-500)]">
                    {retained > 0 ? `${label} retido na nota: ${brl(retained)}` : `A nota não mostra ${label} retido.`}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700 hover:underline"
                  onClick={() => setItems((prev) => prev.filter((x) => x.nfId !== it.nfId))}
                >
                  Tirar
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--gray-500)]">
                    <th className="py-1 font-medium">Rubrica</th>
                    <th className="py-1 text-right font-medium">Na nota</th>
                    <th className="w-44 py-1 text-right font-medium">{label} nesta rubrica</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rubrics.map((r) => (
                    <tr key={r.allocationId} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-2">{r.label}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-[var(--gray-500)]">{brl(r.amount)}</td>
                      <td className="py-2">
                        <MoneyInput
                          ariaLabel={`${label} na rubrica ${r.label}`}
                          value={it.amounts[r.allocationId] ?? null}
                          onChange={(v) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.nfId === it.nfId ? { ...x, amounts: { ...x.amounts, [r.allocationId]: v } } : x,
                              ),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`text-right text-xs ${off ? "text-amber-800" : "text-[var(--gray-500)]"}`}>
                Neste pagamento: {brl(sum)}
                {off ? ` (a nota retém ${brl(retained)})` : ""}
              </p>
              <label className="field">
                <span>{TAX_DOC_TYPES.NF_IMPOSTO} deste pagamento (se houver)</span>
                <input name={`taxNfFile_${it.nfId}`} type="file" accept=".pdf,.xml,image/*" />
              </label>
            </div>
          );
        })}

        {available.length > 0 ? (
          <SearchSelect
            key={items.length}
            value=""
            onValueChange={(v) => {
              const p = byId.get(v);
              if (p) setItems((prev) => [...prev, { nfId: p.nfId, amounts: suggested(p, taxKind) }]);
            }}
            options={available}
            placeholder={items.length ? "Adicionar outro pagamento…" : "Escolher pagamento…"}
            searchPlaceholder="Buscar fornecedor, nº da nota…"
            emptyText="Nenhum pagamento encontrado."
          />
        ) : null}
      </section>

      <p className="text-sm font-semibold text-[var(--navy)]">
        Total da guia: {brl(total)}
        {items.length > 1 ? ` (${items.length} pagamentos)` : ""}
      </p>

      {state.pronacOverride ? <PronacOverrideField allowed /> : null}
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.ok ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.message?.includes("Atenção")
              ? "border border-amber-200 bg-amber-50 text-amber-900"
              : "text-emerald-700"
          }`}
        >
          {state.message}{" "}
          {state.id ? (
            <Link href={`/planejamento/compromissos/${state.id}`} className="font-semibold underline">
              Ver pagamento
            </Link>
          ) : null}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={pending || items.length === 0}>
        {pending ? "Enviando…" : "Lançar imposto"}
      </button>
    </form>
  );
}
