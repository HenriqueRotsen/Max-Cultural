"use client";

import { useId, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id?: string;
  name: string;
};

export function PasswordInput({ id, className, onKeyDown, onKeyUp, onBlur, ...props }: Props) {
  const autoId = useId();
  const inputId = id || autoId;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  function readCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  }

  return (
    <div>
      <div className="relative">
        <input
          {...props}
          id={inputId}
          type={visible ? "text" : "password"}
          className={`w-full pr-11 ${className || ""}`}
          onKeyDown={(e) => {
            readCapsLock(e);
            onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            readCapsLock(e);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            onBlur?.(e);
          }}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--gray-500)] transition hover:text-[var(--navy)]"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          tabIndex={0}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {capsLock ? (
        <p className="mt-1.5 text-xs font-medium text-amber-700" role="status">
          ⚠ Caps Lock está ativado — a senha diferencia maiúsculas de minúsculas.
        </p>
      ) : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.6a2.8 2.8 0 0 0 3.9 3.9M9.9 5.3A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4.1 4.9M6.1 6.1C3.8 7.7 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
