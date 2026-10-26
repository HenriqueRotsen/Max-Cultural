"use client"

import * as React from "react"
import { Combobox } from "@base-ui/react/combobox"
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type SearchSelectOption = {
  value: string
  label: string
  /** Texto secundário (ex.: PRONAC, cidade/UF). Também entra na busca. */
  hint?: string
}

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
}

function matches(item: SearchSelectOption, query: string) {
  const q = norm(query)
  if (!q) return true
  const hay = norm(`${item.label} ${item.hint ?? ""}`)
  return q.split(/\s+/).every((part) => hay.includes(part))
}

/**
 * Select com busca integrada (sem acento, por partes). `onSearch` permite buscar no
 * servidor quando a lista vem paginada; a filtragem local continua valendo.
 */
export function SearchSelect({
  value,
  options,
  onValueChange,
  placeholder = "Selecione…",
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.",
  disabled,
  onSearch,
  className,
  id,
  showHintInTrigger = true,
  "aria-label": ariaLabel,
}: {
  value: string
  options: SearchSelectOption[]
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  onSearch?: (query: string) => void
  className?: string
  id?: string
  showHintInTrigger?: boolean
  "aria-label"?: string
}) {
  const selected = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  )
  // Mantém o rótulo do selecionado mesmo se a busca no servidor o tirar da lista.
  const [lastSelected, setLastSelected] = React.useState<SearchSelectOption | null>(null)
  if (selected && selected !== lastSelected) setLastSelected(selected)
  const current = selected ?? (lastSelected?.value === value ? lastSelected : null)

  return (
    <Combobox.Root
      items={options}
      value={current}
      onValueChange={(item) =>
        onValueChange((item as SearchSelectOption | null)?.value ?? "")
      }
      onInputValueChange={(q) => onSearch?.(q)}
      itemToStringLabel={(item) => (item as SearchSelectOption).label}
      isItemEqualToValue={(a, b) =>
        (a as SearchSelectOption).value === (b as SearchSelectOption).value
      }
      filter={(item, q) => matches(item as SearchSelectOption, q)}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? (
            <>
              {current.label}
              {current.hint && showHintInTrigger ? (
                <span className="ml-1.5 text-muted-foreground">· {current.hint}</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="z-[60] outline-none"
        >
          <Combobox.Popup
            className="flex max-h-[min(22rem,var(--available-height))] w-[max(var(--anchor-width),16rem)] max-w-[calc(100vw-1.5rem)] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0"
            aria-label={ariaLabel ?? placeholder}
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <Combobox.Input
                placeholder={searchPlaceholder}
                className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground any-pointer-coarse:text-base"
              />
            </div>
            <Combobox.Empty>
              <div className="px-3 py-4 text-sm text-muted-foreground">{emptyText}</div>
            </Combobox.Empty>
            <Combobox.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 scroll-py-1 empty:p-0">
              {(item: SearchSelectOption) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <Combobox.ItemIndicator className="col-start-1">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                  <span className="col-start-2 min-w-0">
                    <span className="block truncate">{item.label}</span>
                    {item.hint ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.hint}
                      </span>
                    ) : null}
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
