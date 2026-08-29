"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { uploadNfForReview } from "@/lib/planning/actions";
import type { ActionState } from "@/lib/planning/action-state";

const initial: ActionState = {};

type DocKind = "NF" | "RPA";

export function NfUploadForm({
  planningProjectId,
  attachCommitmentId,
}: {
  planningProjectId: string;
  attachCommitmentId?: string;
}) {
  const action = uploadNfForReview.bind(null, planningProjectId);
  const [state, formAction, pending] = useActionState(action, initial);
  const [kind, setKind] = useState<DocKind | null>(null);
  const [fileName, setFileName] = useState("");

  if (!kind) {
    return (
      <div className="card space-y-5 p-5">
        <div>
          <h2 className="font-semibold text-[var(--navy)]">
            Qual documento você vai subir?
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            Escolha o tipo antes de enviar o arquivo.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="group rounded-xl border border-[var(--border)] p-5 text-left transition hover:border-[#c5d0e4] hover:bg-[var(--gray-50)]"
            onClick={() => setKind("NF")}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--navy)] text-sm font-bold text-white">
              NF
            </span>
            <p className="mt-3 text-lg font-semibold text-[var(--navy)]">
              Nota fiscal
            </p>
            <p className="mt-1 text-sm text-[var(--gray-500)]">
              Pessoa jurídica (CNPJ).
            </p>
            <p className="mt-4 text-sm font-semibold text-[var(--gold)] group-hover:underline">
              Continuar com NF →
            </p>
          </button>
          <button
            type="button"
            className="group rounded-xl border border-[var(--border)] p-5 text-left transition hover:border-[#c5d0e4] hover:bg-[var(--gray-50)]"
            onClick={() => setKind("RPA")}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--navy-soft)] text-sm font-bold text-[var(--navy)]">
              RPA
            </span>
            <p className="mt-3 text-lg font-semibold text-[var(--navy)]">
              Recibo (RPA)
            </p>
            <p className="mt-1 text-sm text-[var(--gray-500)]">
              Pessoa física (CPF).
            </p>
            <p className="mt-4 text-sm font-semibold text-[var(--gold)] group-hover:underline">
              Continuar com RPA →
            </p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-5 p-5">
      <input type="hidden" name="documentKind" value={kind} />
      {attachCommitmentId ? (
        <input
          type="hidden"
          name="attachCommitmentId"
          value={attachCommitmentId}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--gray-50)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
              kind === "NF"
                ? "bg-[var(--navy)] text-white"
                : "bg-[var(--navy-soft)] text-[var(--navy)]"
            }`}
          >
            {kind}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[var(--navy)]">
              {kind === "NF" ? "Nota fiscal" : "Recibo de pagamento autônomo"}
            </p>
            <p className="text-xs text-[var(--gray-500)]">
              {kind === "NF" ? "Pessoa jurídica (CNPJ)" : "Pessoa física (CPF)"}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--navy)] transition hover:border-[var(--navy)] hover:bg-[var(--navy-soft)]"
          onClick={() => {
            setKind(null);
            setFileName("");
          }}
        >
          <span aria-hidden>←</span>
          Trocar tipo
        </button>
      </div>

      {state.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>{state.error}</p>
          {state.href ? (
            <Link
              href={state.href}
              className="mt-2 inline-block font-semibold text-[var(--navy)] underline"
            >
              Abrir documento existente →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="field">
        <span>
          {kind === "RPA" ? "Arquivo do RPA" : "Arquivo da NF"}
        </span>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-8 text-center transition hover:border-[var(--navy)] hover:bg-[var(--navy-soft)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--navy-soft)] text-[var(--navy)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 16V4m0 0 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="space-y-1">
            <span className="block text-sm font-semibold text-[var(--navy)]">
              {fileName ? "Trocar arquivo" : "Escolher PDF ou XML"}
            </span>
            <span className="block text-xs text-[var(--gray-500)]">
              Arraste para cá ou clique para selecionar
            </span>
          </span>
          {fileName ? (
            <span
              className="max-w-full truncate rounded-full bg-[var(--gray-50)] px-3 py-1 text-xs font-medium text-[var(--navy)]"
              title={fileName}
            >
              {fileName}
            </span>
          ) : null}
          <input
            name="nfFile"
            type="file"
            accept=".pdf,.xml,application/pdf,text/xml"
            required
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
        </label>
      </div>

      <p className="text-xs text-[var(--gray-500)]">
        O sistema tenta extrair valores, impostos e dados de pagamento
        automaticamente. Você confere e rateia nas rubricas na próxima etapa.
      </p>

      <button type="submit" className="btn" disabled={pending || !fileName}>
        {pending ? "Extraindo…" : `Enviar ${kind} e extrair`}
      </button>
    </form>
  );
}
