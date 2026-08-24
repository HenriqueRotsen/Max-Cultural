"use client";

import { useState, useTransition } from "react";
import { createAccount, lookupAccountByCgccpf } from "@/lib/actions";
import { FieldLabel } from "@/components/FieldHelp";
import { formatCgccpf } from "@/lib/format";
import { HELP } from "@/lib/help";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function CreateAccountForm({ syncEnabled = true }: { syncEnabled?: boolean }) {
  const [cgccpf, setCgccpf] = useState("");
  const [name, setName] = useState("");
  const [personType, setPersonType] = useState<"PJ" | "PF" | "MEI">("PJ");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastLookup, setLastLookup] = useState("");

  function lookupDocument(value: string) {
    const digits = onlyDigits(value);
    if (digits.length !== 11 && digits.length !== 14) return;
    if (digits === lastLookup) return;

    setLastLookup(digits);
    startTransition(async () => {
      setStatus(digits.length === 14 ? "Consultando CNPJ…" : "Buscando no SALIC…");
      try {
        const result = await lookupAccountByCgccpf(digits);
        if (!result.found) {
          setStatus(result.error || "Não encontrado");
          return;
        }

        setCgccpf(formatCgccpf(result.cgccpf));
        setName(result.name);
        setPersonType(result.personType);

        if (result.source === "brasilapi") {
          setStatus("Dados preenchidos pela consulta de CNPJ. Revise antes de salvar.");
        } else {
          setStatus("Nome preenchido pelo SALIC.");
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Falha na consulta automática");
      }
    });
  }

  return (
    <form action={createAccount} className="card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
        <h2 className="text-base font-semibold text-[var(--navy)]">Novo proponente</h2>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Cadastro da conta do proponente no SALIC. Ao completar o CNPJ (14 dígitos) ou CPF (11), o
          nome e o tipo são preenchidos automaticamente.
        </p>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div className="field">
          <FieldLabel htmlFor="cgccpf" help={HELP.cgccpf}>
            CNPJ/CPF do proponente
          </FieldLabel>
          <input
            id="cgccpf"
            name="cgccpf"
            required
            value={cgccpf}
            placeholder="00.000.000/0001-00"
            onChange={(e) => {
              const raw = e.target.value;
              const digits = onlyDigits(raw).slice(0, 14);
              const formatted =
                digits.length === 11 || digits.length === 14 ? formatCgccpf(digits) : raw;
              setCgccpf(formatted);
              setStatus(null);
              if (digits.length === 11 || digits.length === 14) {
                lookupDocument(digits);
              } else {
                setLastLookup("");
              }
            }}
            onBlur={(e) => {
              const digits = onlyDigits(e.target.value);
              if (digits.length === 11 || digits.length === 14) {
                setCgccpf(formatCgccpf(digits));
                lookupDocument(digits);
              }
            }}
          />
        </div>
        <div className="field">
          <FieldLabel htmlFor="name">Nome da empresa / proponente</FieldLabel>
          <input
            id="name"
            name="name"
            required
            value={name}
            placeholder="Preenchido automaticamente pelo CNPJ"
            onChange={(e) => setName(e.target.value)}
          />
          {(status || pending) && (
            <p className={`text-xs ${pending ? "text-[var(--gray-400)]" : "text-[var(--gray-500)]"}`}>
              {pending ? "Consultando…" : status}
            </p>
          )}
        </div>
        <div className="field">
          <FieldLabel htmlFor="personType" help={HELP.personType}>
            Tipo de proponente
          </FieldLabel>
          <select
            id="personType"
            name="personType"
            value={personType}
            onChange={(e) =>
              setPersonType(
                e.target.value === "PF" || e.target.value === "MEI" ? e.target.value : "PJ",
              )
            }
          >
            <option value="PJ">Empresa (PJ) — até 20%</option>
            <option value="PF">Pessoa física — até 30%</option>
            <option value="MEI">MEI — até 30%</option>
          </select>
        </div>

        {syncEnabled ? (
          <>
            <div className="md:col-span-2 pt-1">
              <h3 className="text-sm font-semibold text-[var(--navy)]">Acesso SALIC</h3>
              <p className="mt-0.5 text-xs text-[var(--gray-500)]">Opcional — para sync pela área logada.</p>
            </div>
            <div className="field">
              <FieldLabel htmlFor="salicUsername" help={HELP.salicUser}>
                Usuário do SALIC
              </FieldLabel>
              <input
                id="salicUsername"
                name="salicUsername"
                autoComplete="username"
                placeholder="Opcional"
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="salicPassword" help={HELP.salicPass}>
                Senha do SALIC
              </FieldLabel>
              <input
                id="salicPassword"
                name="salicPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Opcional"
              />
            </div>
          </>
        ) : null}
        <div className="field md:col-span-2">
          <FieldLabel htmlFor="extraPronacs" help={HELP.extraPronacs}>
            Projetos extras (PRONAC)
          </FieldLabel>
          <input id="extraPronacs" name="extraPronacs" placeholder="153774, 193461" />
        </div>
        <div className="md:col-span-2">
          <button type="submit" className="btn" disabled={pending}>
            Adicionar conta
          </button>
        </div>
      </div>
    </form>
  );
}
