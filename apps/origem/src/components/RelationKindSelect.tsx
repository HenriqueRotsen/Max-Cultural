"use client";

import Link from "next/link";
import {
  RELATION_HINTS,
  RELATION_LABELS,
  RELATION_OPTION_GROUPS,
  relationSelectValue,
  type RelationKind,
} from "@/lib/compliance/defaults";

export function RelationKindSelect({
  id,
  name = "relation",
  value,
  defaultValue,
  disabled,
  onChange,
  allowEmpty,
  emptyLabel = "Sem vínculo",
  className,
  hideBondHelp,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  hideBondHelp?: boolean;
}) {
  const raw = (value ?? defaultValue ?? "") as RelationKind | "";
  const current = relationSelectValue(raw) as RelationKind | "";
  const hint =
    current && current in RELATION_HINTS ? RELATION_HINTS[current] : null;

  return (
    <div className="space-y-1">
      <select
        id={id}
        name={name}
        disabled={disabled}
        className={className}
        {...(value !== undefined
          ? {
              value: current,
              onChange: (e) => onChange?.(e.target.value),
            }
          : {
              defaultValue:
                relationSelectValue(defaultValue) || (allowEmpty ? "" : "SPOUSE"),
            })}
      >
        {allowEmpty || !current ? (
          <option value="">{emptyLabel}</option>
        ) : null}
        {RELATION_OPTION_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((opt) => (
              <option key={opt} value={opt}>
                {RELATION_LABELS[opt]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {hint && !hideBondHelp ? (
        <p className="text-xs text-[var(--gray-500)]">{hint}</p>
      ) : null}
      {!hideBondHelp ? (
        <p className="text-[10px] text-[var(--gray-400)]">
          O vínculo art. 23 depende da IN do PRONAC — configure em{" "}
          <Link
            href="/fornecedores?tab=vinculos"
            className="font-medium text-[var(--navy)] underline-offset-2 hover:underline"
          >
            Fornecedores › Vínculos por IN
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
