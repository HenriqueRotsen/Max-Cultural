"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SimpleOption = { value: string; label: React.ReactNode; dot?: string };

/** Select do sistema com uma lista simples de opções (no lugar do `<select>` nativo). */
export function SimpleSelect({
  value,
  onChange,
  options,
  disabled,
  className,
  contentClassName,
  size = "default",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SimpleOption[];
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
}) {
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select value={value} onValueChange={(v) => v != null && onChange(String(v))} disabled={disabled} items={items}>
      <SelectTrigger size={size} aria-label={ariaLabel} className={cn("bg-white", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={cn("min-w-[max(var(--anchor-width),10rem)] p-1", contentClassName)}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="py-1.5">
            {o.dot ? <span className={cn("size-2 shrink-0 rounded-full", o.dot)} /> : null}
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
