"use client";

import { Combobox } from "@base-ui/react/combobox";
import { searchSelectMatches } from "@max/ui";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { SearchSelect } from "@/components/ui/search-select";
import { cn } from "@/lib/utils";

/** `dot`: classe de cor de uma bolinha antes do rótulo (ex.: "bg-emerald-600"). */
export type SimpleOption = { value: string; label: string; dot?: string };

type SimpleSelectProps = {
  value: string;
  onChange: (v: string) => void;
  options: SimpleOption[];
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
};

/** Select do sistema com busca e uma lista simples de opções (no lugar do `<select>` nativo). */
export function SimpleSelect({
  value,
  onChange,
  options,
  disabled,
  className,
  contentClassName,
  size = "default",
  "aria-label": ariaLabel,
}: SimpleSelectProps) {
  const trigger = cn("w-fit bg-white", size === "sm" && "h-7 rounded-[min(var(--radius-md),10px)]", className);
  if (options.some((o) => o.dot)) {
    return (
      <DotSelect
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
        className={trigger}
        contentClassName={contentClassName}
        aria-label={ariaLabel}
      />
    );
  }
  return (
    <SearchSelect
      value={value}
      onValueChange={onChange}
      options={options}
      disabled={disabled}
      className={trigger}
      popupClassName={contentClassName}
      aria-label={ariaLabel}
    />
  );
}

/**
 * O mesmo select com busca do `@max/ui` (classes `mx-ss-*`), mas com a bolinha
 * colorida de cada opção — o componente compartilhado só mostra texto.
 */
function DotSelect({
  value,
  onChange,
  options,
  disabled,
  className,
  contentClassName,
  "aria-label": ariaLabel,
}: Omit<SimpleSelectProps, "size">) {
  const current = options.find((o) => o.value === value) ?? null;
  return (
    <Combobox.Root
      items={options}
      value={current}
      onValueChange={(item) => onChange((item as SimpleOption | null)?.value ?? "")}
      itemToStringLabel={(item) => (item as SimpleOption).label}
      isItemEqualToValue={(a, b) => (a as SimpleOption).value === (b as SimpleOption).value}
      filter={(item, q) => searchSelectMatches(item as SimpleOption, q)}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.Trigger
        aria-label={ariaLabel}
        className={cn(
          "mx-ss-trigger h-8 min-h-0 rounded-lg border-input px-2.5 py-0 text-sm text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-ring",
          className,
        )}
      >
        <span className="mx-ss-value">{current?.label ?? ""}</span>
        <ChevronsUpDownIcon className="mx-ss-chevron" aria-hidden="true" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} collisionPadding={12} className="mx-ss-positioner">
          <Combobox.Popup
            aria-label={ariaLabel}
            className={cn(
              "mx-ss-popup rounded-lg border-0 bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 [&_.mx-ss-item[data-highlighted]]:bg-accent [&_.mx-ss-item[data-highlighted]]:text-accent-foreground [&_.mx-ss-item]:text-sm",
              contentClassName,
            )}
          >
            <div className="mx-ss-search">
              <SearchIcon className="mx-ss-search-icon" aria-hidden="true" />
              <Combobox.Input placeholder="Buscar…" className="mx-ss-input" />
            </div>
            <Combobox.Empty>
              <div className="mx-ss-empty">Nada encontrado.</div>
            </Combobox.Empty>
            <Combobox.List className="mx-ss-list">
              {(item: SimpleOption) => (
                <Combobox.Item key={item.value || "__vazio__"} value={item} className="mx-ss-item">
                  <Combobox.ItemIndicator className="mx-ss-indicator">
                    <CheckIcon className="mx-ss-check" aria-hidden="true" />
                  </Combobox.ItemIndicator>
                  <span className="mx-ss-item-text flex items-center gap-1.5">
                    {item.dot ? <span className={cn("size-2 shrink-0 rounded-full", item.dot)} /> : null}
                    <span className="mx-ss-item-label">{item.label}</span>
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
