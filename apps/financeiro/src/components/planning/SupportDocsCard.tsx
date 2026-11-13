"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { PronacOverrideField } from "@/components/planning/PronacOverrideField";
import { attachSupportDocument, removeSupportDocument } from "@/lib/planning/support-actions";
import { NF_SUBSTITUTES, SUPPORT_LABEL, SUPPORT_TYPES, type SupportType } from "@/lib/planning/support-docs";
import type { ActionState } from "@/lib/planning/action-state";

type SupportDoc = { id: string; supportType: string | null; filename: string; note: string | null };

const initial: ActionState = {};

/**
 * Outros documentos do lançamento: boleto, fatura, recibo, contrato, apólice
 * ou orçamento. Podem chegar em etapas (ex.: boleto e comprovante antes, a
 * apólice depois); todos entram no PDF enviado ao SALIC.
 */
export function SupportDocsCard({
  commitmentId,
  docs,
  canRemove,
  locked,
  salic = true,
}: {
  commitmentId: string;
  docs: SupportDoc[];
  canRemove: boolean;
  /** Projeto encerrado ou lançamento cancelado. */
  locked: boolean;
  /** Projeto federal (Lei Rouanet): os documentos vão no PDF do SALIC. */
  salic?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    attachSupportDocument.bind(null, commitmentId),
    initial,
  );
  const [type, setType] = useState<SupportType | "">("");
  const [removing, startRemove] = useTransition();
  const [removeMsg, setRemoveMsg] = useState<string | null>(null);
  const canReplaceNf = type !== "" && (NF_SUBSTITUTES as readonly string[]).includes(type);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="card space-y-3 p-5">
      <div>
        <h2 className="font-semibold text-[var(--navy)]">Outros documentos</h2>
        <p className="text-xs text-[var(--gray-500)]">
          Boleto, fatura, recibo, contrato, apólice ou orçamento. Podem chegar em etapas
          {salic ? "; todos entram no PDF enviado ao SALIC." : "."}
        </p>
      </div>

      {docs.length > 0 ? (
        <ul className="divide-y divide-[var(--border)] text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium text-[var(--navy)]">
                  {SUPPORT_LABEL[d.supportType as SupportType] ?? "Documento"}
                </p>
                <p className="truncate text-xs text-[var(--gray-500)]">{d.filename}</p>
                {d.note ? <p className="text-xs text-amber-800">{d.note}</p> : null}
              </div>
              {canRemove && !locked ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700 hover:underline"
                  disabled={removing}
                  onClick={() => {
                    if (!confirm("Tirar este documento do lançamento?")) return;
                    startRemove(async () => {
                      const r = await removeSupportDocument(d.id);
                      setRemoveMsg(r.error || r.message || null);
                      router.refresh();
                    });
                  }}
                >
                  Remover
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {removeMsg ? <p className="text-sm text-[var(--gray-600)]">{removeMsg}</p> : null}

      {locked ? null : (
        <form action={formAction} className="space-y-3">
          {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
          {state.pronacOverride ? <PronacOverrideField allowed /> : null}
          {state.ok && state.message ? (
            <p
              className={`text-sm ${
                state.message.includes("Atenção") || state.message.includes("reenvie")
                  ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"
                  : "text-emerald-700"
              }`}
            >
              {state.message}
            </p>
          ) : null}
          <label className="field">
            <span>Tipo</span>
            <select
              name="supportType"
              required
              value={type}
              onChange={(e) => setType(e.target.value as SupportType | "")}
            >
              <option value="">Escolha…</option>
              {SUPPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SUPPORT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Arquivo (PDF ou imagem)</span>
            <input name="supportFile" type="file" accept=".pdf,image/*" required />
          </label>
          {canReplaceNf ? (
            <label key={type} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="replacesNf"
                defaultChecked={type !== "CONTRATO"}
                className="mt-0.5"
              />
              <span>
                Faz o papel da NF/RPA
                <span className="block text-xs text-[var(--gray-500)]">
                  Marque se não vai chegar nota fiscal (ex.: seguro com apólice). Deixe desmarcado se a
                  NF ainda vem.
                </span>
              </span>
            </label>
          ) : null}
          <button type="submit" className="btn btn-ghost" disabled={pending}>
            {pending ? "Anexando…" : "Anexar documento"}
          </button>
        </form>
      )}
    </div>
  );
}
