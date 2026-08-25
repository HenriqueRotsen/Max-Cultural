"use client";

import { useId, useState } from "react";

export type ChartSlice = {
  label: string;
  value: number;
  color: string;
};

function formatValue(n: number, money?: boolean) {
  if (money) {
    return n.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }
  return n.toLocaleString("pt-BR");
}

export function DonutChart({
  slices,
  centerLabel,
  money,
  accent,
}: {
  slices: ChartSlice[];
  centerLabel?: string;
  money?: boolean;
  accent: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const size = 160;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = total > 0 ? (s.value / total) * c : 0;
      const item = { ...s, dash: len, offset };
      offset += len;
      return item;
    });

  const tip = active ? slices.find((s) => s.label === active) : null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(0,0,0,0.06)"
            strokeWidth={stroke}
          />
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={active === a.label ? stroke + 4 : stroke}
              strokeDasharray={`${a.dash} ${c - a.dash}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="butt"
              className="cursor-pointer transition-[stroke-width] duration-150"
              onMouseEnter={() => setActive(a.label)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
            {tip ? tip.label : centerLabel || "Total"}
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: accent }}>
            {formatValue(tip ? tip.value : total, money)}
          </p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
          return (
            <li key={s.label}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition ${
                  active === s.label ? "bg-black/5" : "hover:bg-black/[0.03]"
                }`}
                onMouseEnter={() => setActive(s.label)}
                onMouseLeave={() => setActive(null)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--gray-600)]">
                  {s.label}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--navy)]">
                  {pct}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BarChart({
  items,
  accent,
  money,
}: {
  items: Array<{ label: string; value: number }>;
  accent: string;
  money?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...items.map((i) => i.value), 1);
  const tipId = useId();

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const pct = Math.max(2, (item.value / max) * 100);
        const on = active === i;
        return (
          <div
            key={item.label}
            className="group"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-[var(--gray-600)]">{item.label}</span>
              <span
                className="text-xs font-semibold tabular-nums"
                style={{ color: on ? accent : "var(--navy)" }}
              >
                {formatValue(item.value, money)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${pct}%`,
                  background: accent,
                  opacity: on || active == null ? 1 : 0.45,
                  transform: on ? "scaleY(1.15)" : "scaleY(1)",
                }}
                role="img"
                aria-labelledby={`${tipId}-${i}`}
              />
            </div>
            <span id={`${tipId}-${i}`} className="sr-only">
              {item.label}: {formatValue(item.value, money)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SocioTabs({
  accent,
  soft,
  sections,
}: {
  accent: string;
  soft: string;
  sections: Array<{
    id: string;
    title: string;
    items: Array<{ label: string; count: number; pct: number }>;
  }>;
}) {
  const available = sections.filter((s) => s.items.some((i) => i.count > 0));
  const [tab, setTab] = useState(available[0]?.id || sections[0]?.id || "");
  const current = available.find((s) => s.id === tab) || available[0];

  if (!current) {
    return (
      <p className="text-sm text-[var(--gray-500)]">Sem perfil sociodemográfico.</p>
    );
  }

  const palette = [
    accent,
    "#6366f1",
    "#f59e0b",
    "#ec4899",
    "#10b981",
    "#8b5cf6",
    "#06b6d4",
    "#84cc16",
  ];

  const top = current.items.slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {available.map((s) => {
          const on = s.id === current.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setTab(s.id)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition"
              style={
                on
                  ? { background: accent, color: "#fff" }
                  : { background: soft, color: accent }
              }
            >
              {s.title}
            </button>
          );
        })}
      </div>
      <DonutChart
        accent={accent}
        centerLabel={current.title}
        slices={top.map((item, i) => ({
          label: item.label,
          value: item.count,
          color: palette[i % palette.length]!,
        }))}
      />
    </div>
  );
}
