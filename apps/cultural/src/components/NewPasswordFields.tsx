"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { checkPasswordRules, passwordStrength } from "@/lib/password-rules";

const STRENGTH_COLORS = ["#e5e7eb", "#dc2626", "#d97706", "#16a34a", "#15803d"];

/**
 * Campos "nova senha" + "confirmar" com checklist ao vivo dos requisitos,
 * medidor de força e aviso de confirmação. O servidor continua validando.
 */
export function NewPasswordFields({
  email,
  passwordLabel = "Nova senha",
  confirmLabel = "Confirmar nova senha",
  onValidChange,
}: {
  email?: string;
  passwordLabel?: string;
  confirmLabel?: string;
  onValidChange?: (valid: boolean) => void;
}) {
  const listId = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touchedConfirm, setTouchedConfirm] = useState(false);

  const checks = useMemo(() => checkPasswordRules(password, email), [password, email]);
  const strength = useMemo(() => passwordStrength(password, email), [password, email]);
  const allOk = checks.every((c) => c.ok);
  const missing = checks.filter((c) => !c.ok).length;
  const matches = confirm.length > 0 && confirm === password;
  const valid = allOk && matches;

  useEffect(() => {
    onValidChange?.(valid);
  }, [valid, onValidChange]);

  const typed = password.length > 0;

  return (
    <div className="space-y-4">
      <div className="field">
        <label htmlFor="password">{passwordLabel}</label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={listId}
          aria-invalid={typed && !allOk}
        />

        {typed ? (
          <div className="mt-2" aria-live="polite">
            <div className="flex gap-1" aria-hidden>
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className="h-1.5 flex-1 rounded-full transition-colors"
                  style={{
                    background:
                      strength.score >= step
                        ? STRENGTH_COLORS[strength.score]
                        : STRENGTH_COLORS[0],
                  }}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--gray-500)]">
              Força da senha:{" "}
              <strong style={{ color: STRENGTH_COLORS[strength.score] }}>{strength.label}</strong>
              {missing > 0
                ? ` · falta${missing === 1 ? "" : "m"} ${missing} requisito${missing === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
        ) : null}

        <div
          id={listId}
          className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--gray-50)] px-3 py-2.5"
        >
          <p className="text-xs font-semibold text-[var(--gray-600)]">
            {allOk ? "Todos os requisitos atendidos ✓" : "Sua senha precisa ter:"}
          </p>
          <ul className="mt-1.5 grid gap-1 text-xs sm:grid-cols-2">
            {checks.map((c) => {
              const state = !typed ? "idle" : c.ok ? "ok" : "fail";
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-1.5"
                  style={{
                    color:
                      state === "ok" ? "#15803d" : state === "fail" ? "#b91c1c" : "var(--gray-500)",
                  }}
                >
                  <span aria-hidden className="inline-block w-3 text-center font-bold">
                    {state === "ok" ? "✓" : state === "fail" ? "✗" : "•"}
                  </span>
                  <span>
                    {c.label}
                    <span className="sr-only">
                      {state === "ok" ? " (atendido)" : state === "fail" ? " (pendente)" : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="field">
        <label htmlFor="confirm">{confirmLabel}</label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouchedConfirm(true)}
          aria-invalid={confirm.length > 0 && !matches}
        />
        {confirm.length > 0 && (touchedConfirm || confirm.length >= password.length) ? (
          <p
            className="mt-1.5 text-xs font-medium"
            style={{ color: matches ? "#15803d" : "#b91c1c" }}
            role="status"
          >
            {matches ? "✓ As senhas coincidem." : "✗ As senhas não coincidem."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
