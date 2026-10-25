"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addWatchedSupplier, lookupFornecedorByCgccpf } from "@/lib/actions";
import { FieldLabel } from "@/components/FieldHelp";
import { cgccpfValidationError, formatCgccpf } from "@/lib/format";
import { HELP } from "@/lib/help";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function AddWatchedSupplierForm() {
  const router = useRouter();
  const [cgccpf, setCgccpf] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"muted" | "warn" | "ok">("muted");
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastLookup, setLastLookup] = useState("");
  const [alreadyWatched, setAlreadyWatched] = useState(false);

  async function lookup(value: string) {
    const digits = onlyDigits(value);
    if (digits.length !== 11 && digits.length !== 14) {
      setStatus(null);
      setAlreadyWatched(false);
      return;
    }
    const invalid = cgccpfValidationError(digits);
    if (invalid) {
      setStatus(invalid);
      setStatusTone("warn");
      setAlreadyWatched(false);
      setLastLookup("");
      return;
    }
    if (digits === lastLookup || lookingUp || saving) return;

    setLastLookup(digits);
    setLookingUp(true);
    setStatus("Buscando fornecedor…");
    setStatusTone("muted");
    try {
      const result = await lookupFornecedorByCgccpf(digits);
      if (result.found) {
        setCgccpf(formatCgccpf(digits));
        setNameQuery(result.nome);
        setLabel((prev) => (prev.trim() ? prev : result.nome));
        if ("alreadyWatched" in result && result.alreadyWatched) {
          setAlreadyWatched(true);
          setStatus("Este fornecedor já está na lista de observados.");
          setStatusTone("warn");
        } else {
          setAlreadyWatched(false);
          setStatus(
            digits.length === 11
              ? "Nome preenchido (CPF)"
              : "Nome preenchido automaticamente",
          );
          setStatusTone("ok");
        }
      } else {
        setAlreadyWatched(false);
        setStatus(result.error || "Não encontrado");
        setStatusTone("warn");
      }
    } catch (error) {
      setAlreadyWatched(false);
      setStatus(error instanceof Error ? error.message : "Falha na consulta");
      setStatusTone("warn");
    } finally {
      setLookingUp(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || lookingUp) return;

    if (alreadyWatched) {
      setStatus("Este fornecedor já está na lista de observados.");
      setStatusTone("warn");
      return;
    }

    const digits = onlyDigits(cgccpf);
    if (digits) {
      const invalid = cgccpfValidationError(digits);
      if (invalid) {
        setStatus(invalid);
        setStatusTone("warn");
        return;
      }
    }

    const formData = new FormData(e.currentTarget);

    setSaving(true);
    try {
      const result = await addWatchedSupplier(formData);
      if (!result.ok) {
        setStatus(result.error);
        setStatusTone("warn");
        if ("alreadyWatched" in result && result.alreadyWatched) {
          setAlreadyWatched(true);
        }
        return;
      }
      setCgccpf("");
      setNameQuery("");
      setLabel("");
      setLastLookup("");
      setAlreadyWatched(false);
      setStatus("Adicionado à observação.");
      setStatusTone("ok");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao adicionar");
      setStatusTone("warn");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
        <h2 className="text-base font-semibold text-[var(--navy)]">Adicionar observado</h2>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Observar alguém filtra a análise. Relacionamentos A↔B são cadastrados na aba
          Observados.
        </p>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div className="field">
          <FieldLabel htmlFor="cgccpf" help={HELP.watchedCgccpf}>
            CNPJ/CPF
          </FieldLabel>
          <input
            id="cgccpf"
            name="cgccpf"
            value={cgccpf}
            placeholder="00.000.000/0001-00 ou CPF"
            disabled={saving}
            onChange={(e) => {
              setCgccpf(e.target.value);
              setLastLookup("");
              setStatus(null);
              setAlreadyWatched(false);
            }}
            onBlur={(e) => {
              const digits = onlyDigits(e.target.value);
              if (digits.length === 11 || digits.length === 14) {
                setCgccpf(formatCgccpf(digits));
              }
              void lookup(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <FieldLabel htmlFor="nameQuery" help={HELP.watchedName}>
            Nome
          </FieldLabel>
          <input
            id="nameQuery"
            name="nameQuery"
            value={nameQuery}
            placeholder="Preenchido pelo CNPJ; CPF pode precisar digitar"
            disabled={saving}
            onChange={(e) => setNameQuery(e.target.value)}
          />
          {status && (
            <p
              className={
                statusTone === "warn"
                  ? "text-xs text-[#8a4b12]"
                  : statusTone === "ok"
                    ? "text-xs text-[var(--navy)]"
                    : "text-xs text-[var(--gray-500)]"
              }
            >
              {lookingUp ? "Buscando fornecedor…" : status}
            </p>
          )}
        </div>
        <div className="field md:col-span-2">
          <FieldLabel htmlFor="label" help={HELP.watchedLabel}>
            Apelido
          </FieldLabel>
          <input
            id="label"
            name="label"
            value={label}
            placeholder="Opcional — ex.: Produtora X"
            disabled={saving}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            className="btn"
            disabled={saving || lookingUp || alreadyWatched}
          >
            {saving
              ? "Salvando…"
              : lookingUp
                ? "Consultando…"
                : alreadyWatched
                  ? "Já está na lista"
                  : "Adicionar à observação"}
          </button>
        </div>
      </div>
    </form>
  );
}
