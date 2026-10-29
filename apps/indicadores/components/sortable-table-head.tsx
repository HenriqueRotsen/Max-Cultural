"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/table-sort";

type SortableHeadProps = {
  label: React.ReactNode;
  sortKey: string;
  activeKey?: string | null;
  activeDir?: SortDir;
  onSort: (key: string) => void;
  className?: string;
  align?: "left" | "right" | "center";
};

export function SortableTableHead({
  label,
  sortKey,
  activeKey,
  activeDir = "asc",
  onSort,
  className,
  align = "left",
}: SortableHeadProps) {
  const active = activeKey === sortKey;
  const Icon = active
    ? activeDir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex w-full items-center gap-1 text-left text-xs font-semibold tracking-wide text-brand-deep transition-colors hover:text-brand",
        align === "right" && "justify-end text-right",
        align === "center" && "justify-center text-center",
        className,
      )}
    >
      <span>{label}</span>
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          active ? "text-brand" : "text-muted-foreground/70",
        )}
        aria-hidden
      />
    </button>
  );
}

export function SortIndicator({
  active,
  dir = "asc",
}: {
  active: boolean;
  dir?: SortDir;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <Icon
      className={cn(
        "size-3.5 shrink-0",
        active ? "text-brand" : "text-muted-foreground/70",
      )}
      aria-hidden
    />
  );
}
