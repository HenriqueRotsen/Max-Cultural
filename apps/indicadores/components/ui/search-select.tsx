"use client"

import {
  SearchSelect as BaseSearchSelect,
  type SearchSelectOption,
  type SearchSelectProps,
} from "@max/ui"

import { cn } from "@/lib/utils"

export type { SearchSelectOption }

/**
 * Select com busca (componente compartilhado `@max/ui`) no visual do Indicadores.
 * Mesma API: `value`/`onValueChange`, ou `name`/`defaultValue` em formulário.
 */
export function SearchSelect({ className, popupClassName, ...props }: SearchSelectProps) {
  return (
    <BaseSearchSelect
      {...props}
      className={cn(
        "h-8 min-h-0 rounded-lg border-input bg-transparent px-2.5 py-0 text-sm text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-ring",
        className,
      )}
      popupClassName={cn(
        "rounded-lg border-0 bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 [&_.mx-ss-item[data-highlighted]]:bg-accent [&_.mx-ss-item[data-highlighted]]:text-accent-foreground [&_.mx-ss-item]:text-sm",
        popupClassName,
      )}
    />
  )
}
