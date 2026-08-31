"use client";

import { useEffect, useState, useTransition } from "react";
import { listFluxoContextosAction } from "@/lib/planning/actions";
import { previewPlanningProjectContext } from "@/lib/planning/federal/actions";
import type { FluxoContextResolve } from "@/lib/fluxo/provision-projeto";

type Props = {
  accountId: string;
  projectCode: string;
  projectNameHint?: string;
  disabled?: boolean;
};

export function FluxoContextField({
  accountId,
  projectCode,
  projectNameHint,
  disabled,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [projectName, setProjectName] = useState("");
  const [resolve, setResolve] = useState<FluxoContextResolve | null>(null);
  const [contextos, setContextos] = useState<
    Array<{ id: string; nome: string; stem?: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "link" | "create">("auto");
  const [contextoId, setContextoId] = useState("");
  const [contextoNome, setContextoNome] = useState("");

  useEffect(() => {
    void listFluxoContextosAction().then(setContextos);
  }, []);

  useEffect(() => {
    const code = projectCode.trim();
    if (!code || disabled) {
      setResolve(null);
      setProjectName("");
      setError(null);
      setMode("auto");
      setContextoId("");
      setContextoNome("");
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(async () => {
        setError(null);
        const result = await previewPlanningProjectContext(
          accountId,
          code,
          projectNameHint,
        );
        if (!result.ok) {
          setError(result.error);
          setResolve(null);
          return;
        }
        setProjectName(result.projectName);
        setResolve(result.resolve);
        if (result.resolve.status === "matched" && result.resolve.contexto) {
          setMode("auto");
          setContextoId(result.resolve.contexto.id);
          setContextoNome("");
        } else if (result.resolve.status === "ambiguous") {
          setMode("link");
          setContextoId(result.resolve.candidates[0]?.id ?? "");
          setContextoNome("");
        } else {
          setMode("create");
          setContextoId("");
          setContextoNome(result.resolve.suggestedNome);
        }
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [accountId, projectCode, projectNameHint, disabled]);

  if (!projectCode.trim()) return null;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--purple-100)] bg-[var(--purple-50)]/40 p-4">
      <div>
        <p className="text-sm font-medium text-[var(--navy)]">Contexto no MAX Fluxo</p>
        <p className="text-xs text-[var(--gray-500)]">
          O projeto aparecerá no Fluxo (sem inscrições ainda) para futura importação de
          planilha. O contexto é inferido pelo nome — ex.: &quot;Arte em cores 7&quot; →
          &quot;Arte em cores&quot;.
        </p>
      </div>

      {pending ? (
        <p className="text-sm text-[var(--gray-500)]">Consultando SALIC e Fluxo…</p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      {projectName ? (
        <p className="text-sm text-[var(--gray-600)]">
          Projeto: <span className="font-medium text-[var(--navy)]">{projectName}</span>
        </p>
      ) : null}

      {resolve?.status === "matched" && resolve.contexto ? (
        <p className="text-sm text-[var(--gray-600)]">
          Contexto encontrado:{" "}
          <span className="font-medium text-[var(--navy)]">{resolve.contexto.nome}</span>
        </p>
      ) : null}

      {resolve && resolve.status !== "matched" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={mode === "link" ? "btn" : "btn-secondary"}
              onClick={() => setMode("link")}
            >
              Vincular existente
            </button>
            <button
              type="button"
              className={mode === "create" ? "btn" : "btn-secondary"}
              onClick={() => setMode("create")}
            >
              Cadastrar novo
            </button>
          </div>

          {mode === "link" ? (
            <label className="field">
              <span>Contexto existente</span>
              <select
                className="w-full"
                value={contextoId}
                onChange={(e) => setContextoId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {(resolve.candidates.length ? resolve.candidates : contextos).map(
                  (c: { id: string; nome: string }) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ),
                )}
              </select>
            </label>
          ) : (
            <label className="field">
              <span>Nome do novo contexto</span>
              <input
                className="w-full"
                value={contextoNome}
                onChange={(e) => setContextoNome(e.target.value)}
                required
                placeholder={resolve.suggestedNome}
              />
            </label>
          )}
        </div>
      ) : null}

      <input type="hidden" name="fluxoContextMode" value={mode} />
      <input type="hidden" name="fluxoContextoId" value={contextoId} />
      <input type="hidden" name="fluxoContextoNome" value={contextoNome} />
    </div>
  );
}
