"use client";

import { SearchSelect } from "@max/ui";

export type FilterSearchOption = {
  value: string;
  label: string;
};

/** Filtro com busca: o SearchSelect compartilhado (@max/ui) com a opção "Todos". */
export function FilterSearchSelect({
  value,
  options,
  onChange,
  placeholder = "Buscar…",
  emptyLabel = "Todos",
  allowEmpty = true,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  options: FilterSearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  /** Quando false, não oferece a opção vazia (útil para enums com valor default). */
  allowEmpty?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <SearchSelect
      value={value}
      options={options}
      onValueChange={onChange}
      placeholder={emptyLabel}
      searchPlaceholder={placeholder}
      emptyText="Nenhum resultado"
      emptyOption={allowEmpty ? emptyLabel : undefined}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
