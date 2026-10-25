"use client";

import type { ChangeEvent } from "react";

type Props = {
  name?: string;
  value?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  /** Fundo e borda para destacar no formulário. */
  boxed?: boolean;
  /** Apenas o switch, sem texto (ex.: células de tabela). */
  compact?: boolean;
};

function SwitchControl({
  name,
  value,
  defaultChecked,
  checked,
  onChange,
  disabled,
}: {
  name?: string;
  value?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  return (
    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked === undefined ? defaultChecked : undefined}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="toggle-track absolute inset-0 rounded-full transition peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--navy)]"
      />
      <span
        aria-hidden
        className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 peer-disabled:opacity-90"
      />
    </span>
  );
}

/** Switch on/off acessível (checkbox estilizado). */
export function ToggleSwitch({
  name,
  value,
  defaultChecked,
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className = "",
  boxed,
  compact,
}: Props) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    onCheckedChange?.(e.target.checked);
  };

  const boxedClass = boxed
    ? "rounded-xl border border-[color-mix(in_srgb,var(--gold)_35%,var(--border))] bg-[var(--gold-soft)] px-4 py-3"
    : "";

  if (compact) {
    return (
      <label
        className={`inline-flex cursor-pointer ${disabled ? "cursor-not-allowed opacity-60" : ""} ${className}`}
      >
        <SwitchControl
          name={name}
          value={value}
          defaultChecked={defaultChecked}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
      </label>
    );
  }

  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-4 text-sm ${disabled ? "cursor-not-allowed opacity-60" : ""} ${boxedClass} ${className}`}
    >
      <span className="min-w-0">
        {label ? (
          <span className="font-medium text-[var(--navy)]">{label}</span>
        ) : null}
        {description ? (
          <span className="mt-0.5 block text-[var(--gray-500)]">{description}</span>
        ) : null}
      </span>
      <span className="mt-0.5">
        <SwitchControl
          name={name}
          value={value}
          defaultChecked={defaultChecked}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
      </span>
    </label>
  );
}
