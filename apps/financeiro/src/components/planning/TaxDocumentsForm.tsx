"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SearchSelect } from "@max/ui";
import { PronacOverrideField } from "@/components/planning/PronacOverrideField";
import { uploadTaxDocuments } from "@/lib/planning/tax-actions";
import type { ActionState } from "@/lib/planning/action-state";
import { TAX_DOC_TYPES, TAX_KIND_LABELS, type TaxKind } from "@/lib/planning/tax-docs";

const initial: ActionState = {};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type TaxPaymentOption = {
  nfId: string;
  label: string;
  hint?: string;
  taxes: Array<{ kind: TaxKind; label: string; amount: number }>;
  /** Impostos que já têm documentos lançados. */
  done: TaxKind[];
};

const FILE_FIELDS = [
  { field: "guiaFile", label: TAX_DOC_TYPES.GUIA, accept: ".pdf,image/*", required: true },
  { field: "taxNfFile", label: `${TAX_DOC_TYPES.NF_IMPOSTO} (se houver)`, accept: ".pdf,.xml,image/*", required: false },
  { field: "proofFile", label: "Comprovante do imposto", accept: ".pdf,image/*", required: true },
] as const;

type Picked = { file: File; url: string };

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
  const [nfId, setNfId] = useState(
    payments.some((p) => p.nfId === initialNfId) ? initialNfId! : (payments[0]?.nfId ?? ""),
  );
  const chosen = payments.find((p) => p.nfId === nfId);
  const kinds: Array<{ value: TaxKind; label: string }> = chosen?.taxes.length
    ? chosen.taxes.map((t) => ({
        value: t.kind,
        label: `${t.label} · ${brl(t.amount)}${chosen.done.includes(t.kind) ? " (já lançado)" : ""}`,
      }))
    : (Object.keys(TAX_KIND_LABELS) as TaxKind[]).map((k) => ({ value: k, label: TAX_KIND_LABELS[k] }));
  const firstOpenKind = kinds.find((k) => !chosen?.done.includes(k.value))?.value ?? kinds[0]?.value ?? "";
  const [taxKind, setTaxKind] = useState<string>(firstOpenKind);
  const [files, setFiles] = useState<Record<string, Picked | null>>({});
  function pick(field: string, file: File | null) {
    setFiles((prev) => {
      if (prev[field]) URL.revokeObjectURL(prev[field]!.url);
      return { ...prev, [field]: file ? { file, url: URL.createObjectURL(file) } : null };
    });
  }
  // Depois de lançar, o formulário limpa os arquivos: a prévia some junto.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setFiles({});
  }

  if (payments.length === 0) {
    return (
      <p className="text-sm text-[var(--gray-500)]">
        Nenhum pagamento com nota neste projeto ainda. O imposto é lançado no pagamento de uma NF/RPA.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <label className="field">
        <span>Pagamento</span>
        <SearchSelect
          name="nfId"
          required
          value={nfId}
          onValueChange={(v) => {
            setNfId(v);
            const p = payments.find((x) => x.nfId === v);
            const open = p?.taxes.find((t) => !p.done.includes(t.kind))?.kind ?? p?.taxes[0]?.kind ?? "iss";
            setTaxKind(open);
          }}
          options={payments.map((p) => ({ value: p.nfId, label: p.label, hint: p.hint }))}
          placeholder="Escolha o pagamento"
          searchPlaceholder="Buscar fornecedor, nº da nota…"
          emptyText="Nenhum pagamento encontrado."
        />
      </label>
      <label className="field">
        <span>Imposto</span>
        <SearchSelect
          name="taxKind"
          required
          value={taxKind}
          onValueChange={setTaxKind}
          options={kinds}
          placeholder="Escolha o imposto"
          searchPlaceholder="Buscar imposto…"
          emptyText="Nenhum imposto encontrado."
        />
        {chosen && chosen.taxes.length === 0 ? (
          <span className="text-xs text-[var(--gray-500)]">Esta nota não mostra imposto retido.</span>
        ) : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        {FILE_FIELDS.map((f) => (
          <div key={f.field} className="flex flex-col gap-2">
            <label className="field">
              <span>{f.label}</span>
              <input
                name={f.field}
                type="file"
                accept={f.accept}
                required={f.required}
                onChange={(e) => pick(f.field, e.target.files?.[0] ?? null)}
              />
            </label>
            <FilePreview picked={files[f.field] ?? null} />
          </div>
        ))}
      </div>
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
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Enviando…" : "Lançar imposto"}
      </button>
    </form>
  );
}
