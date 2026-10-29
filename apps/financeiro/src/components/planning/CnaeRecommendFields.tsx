"use client";

import { useEffect, useRef, useState } from "react";
import { lookupCnaeDescriptionAction } from "@/lib/catalog/actions";
import { formatCnaeInput, normalizeCnaeCode } from "@/lib/catalog/cnae";

export function CnaeRecommendFields({
  initialCnae = "",
  initialDescription = "",
}: {
  initialCnae?: string;
  initialDescription?: string;
}) {
  const [cnae, setCnae] = useState(() => formatCnaeInput(initialCnae) || initialCnae);
  const [description, setDescription] = useState(initialDescription);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  /** Última descrição preenchida automaticamente — se o usuário editar, não sobrescreve. */
  const autoDescRef = useRef(initialDescription);
  const descTouchedRef = useRef(false);
  const descriptionRef = useRef(description);
  const reqId = useRef(0);
  descriptionRef.current = description;

  useEffect(() => {
    const code = normalizeCnaeCode(cnae);
    if (!code || code.length < 7) {
      setLookupError(null);
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const id = ++reqId.current;
      setLoading(true);
      setLookupError(null);
      void lookupCnaeDescriptionAction(code).then((res) => {
        if (id !== reqId.current) return;
        setLoading(false);
        const next = res.description?.trim() || "";
        if (!next) {
          setLookupError("CNAE não encontrado.");
          return;
        }
        const current = descriptionRef.current.trim();
        const canOverwrite =
          !descTouchedRef.current ||
          current === "" ||
          current === autoDescRef.current.trim();
        autoDescRef.current = next;
        if (canOverwrite) {
          setDescription(next);
          descTouchedRef.current = false;
        }
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [cnae]);

  return (
    <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <label className="field">
        <span>Código CNAE</span>
        <input
          name="cnae"
          value={cnae}
          onChange={(e) => setCnae(formatCnaeInput(e.target.value))}
          placeholder="0000-0/00"
          inputMode="numeric"
          autoComplete="off"
          className="w-full"
        />
      </label>
      <label className="field min-w-0">
        <span>
          Descrição
          {loading ? (
            <span className="ml-2 font-normal normal-case tracking-normal text-[var(--gray-400)]">
              buscando…
            </span>
          ) : null}
        </span>
        <input
          name="cnaeDesc"
          value={description}
          onChange={(e) => {
            descTouchedRef.current = true;
            setDescription(e.target.value);
          }}
          placeholder="Preenchida automaticamente ao digitar o CNAE"
          className="w-full"
        />
        {lookupError && !description ? (
          <span className="mt-1 text-xs text-[var(--gray-400)]">{lookupError}</span>
        ) : null}
      </label>
    </div>
  );
}
