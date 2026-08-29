"use client";

import { useState, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { formatPriceLevel, PRICE_LEVELS, type AxisLevels, type PriceLevel } from "@/lib/catalog/price-tiers";

const LEVEL_STYLES: Record<PriceLevel, string> = {
  1: "border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46]",
  2: "border-[var(--border)] bg-[var(--gray-50)] text-[var(--gray-600)]",
  3: "border-[var(--gold)] bg-[var(--gold-soft)] text-[var(--gold-ink)]",
  4: "border-[#fecaca] bg-[#fef2f2] text-[#9f1239]",
};

const LEVEL_HINT: Record<PriceLevel, string> = {
  1: "Barato (>10% abaixo da média)",
  2: "Preço normal (na média)",
  3: "Caro (>10% acima da média)",
  4: "Muito caro (>20% acima da média)",
};

const YEAR_HINT_SUFFIX = " · levantamento do último ano";

const LEVEL_TEXT: Record<PriceLevel, string> = {
  1: "text-[#047857]",
  2: "text-[var(--gray-600)]",
  3: "text-[#b45309]",
  4: "text-[#be123c]",
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function asLevel(value: PriceLevel | number | null | undefined): PriceLevel | null {
  if (value == null) return null;
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

function LevelMark({ level }: { level: PriceLevel | null }) {
  if (level == null) {
    return (
      <span className="inline-flex min-w-12 justify-center rounded-md border border-[var(--border)] bg-[var(--gray-50)] px-2 py-0.5 text-sm font-semibold text-[var(--gray-400)]">
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex min-w-12 justify-center rounded-md border px-2 py-0.5 text-sm font-bold tracking-tight",
        LEVEL_STYLES[level],
      )}
    >
      {formatPriceLevel(level)}
    </span>
  );
}

function stopLinkNavigation(e: MouseEvent | PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function PriceTierLegendDialog({
  open,
  onClose,
  current,
  axes,
}: {
  open: boolean;
  onClose: () => void;
  current?: PriceLevel | null;
  axes?: AxisLevels | null;
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(e) => {
        stopLinkNavigation(e);
        onClose();
      }}
      onMouseDown={stopLinkNavigation}
      onPointerDown={stopLinkNavigation}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Posicionamento de preço"
        className="max-h-[min(90vh,640px)] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={stopLinkNavigation}
        onMouseDown={stopLinkNavigation}
        onPointerDown={stopLinkNavigation}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--border)] bg-white px-4 py-3">
          <p className="text-sm font-semibold text-[var(--navy)]">Posicionamento de preço</p>
          <button type="button" className="btn btn-ghost px-2 py-1 text-sm" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-[var(--gray-500)]">
            Comparação com a média da sua base no{" "}
            <strong className="font-semibold text-[var(--navy)]">levantamento do último ano</strong>
            , na mesma categoria e unidade de preço.
          </p>
          {axes ? (
            <ul className="space-y-2">
              {(
                [
                  { key: "category" as const, label: "Categoria" },
                  { key: "state" as const, label: "Estado (UF)" },
                  { key: "city" as const, label: "Cidade" },
                ] as const
              ).map((row) => {
                const level = asLevel(axes[row.key]);
                return (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5"
                  >
                    <span className="text-sm font-medium text-[var(--navy)]">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <LevelMark level={level} />
                      <span className="min-w-28 text-right text-xs text-[var(--gray-500)]">
                        {level != null ? LEVEL_HINT[level] : "Sem dados suficientes"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-2">
              {PRICE_LEVELS.map((level) => (
                <li
                  key={level}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                    current === level
                      ? "border-[var(--navy)] bg-[var(--navy-soft)]"
                      : "border-[var(--border)] bg-white",
                  )}
                >
                  <LevelMark level={level} />
                  <span className="text-sm text-[var(--navy)]">{LEVEL_HINT[level]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Compacto $–$$$$ ao lado do nome. Clique abre a legenda Cat/UF/Cidade. */
export function CatalogPriceDollars({
  level,
  axes,
  size = "md",
}: {
  level?: PriceLevel | number | null;
  axes?: AxisLevels | null;
  size?: "sm" | "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const resolved = asLevel(level) ?? 2;

  const sizeCls = size === "lg" ? "text-base" : size === "sm" ? "text-xs" : "text-sm";
  const hint = `${LEVEL_HINT[resolved]}${YEAR_HINT_SUFFIX}`;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex shrink-0 items-center rounded-md px-1 py-0.5 font-bold tracking-tight tabular-nums",
          "transition-colors hover:bg-black/[0.04]",
          sizeCls,
          LEVEL_TEXT[resolved],
        )}
        title={`${hint} · clique para detalhes`}
        aria-label={`${hint}. Abrir detalhes`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {formatPriceLevel(resolved)}
      </button>
      <PriceTierLegendDialog
        open={open}
        onClose={() => setOpen(false)}
        current={resolved}
        axes={axes}
      />
    </>
  );
}
