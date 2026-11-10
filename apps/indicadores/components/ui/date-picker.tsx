"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { DayPicker, type DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** yyyy-mm-dd ⇄ Date local (sem fuso: as datas do sistema são por dia). */
function paraData(v: string | null | undefined): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
const paraIso = (d: Date) => format(d, "yyyy-MM-dd");
const curta = (d: Date) => format(d, "dd/MM/yyyy");

const CLASSES = {
  root: "text-sm",
  months: "relative flex flex-col gap-4",
  month: "space-y-3",
  month_caption: "flex h-8 items-center justify-center",
  caption_label: "font-heading text-sm font-semibold capitalize text-brand-deep",
  nav: "absolute inset-x-0 top-0 flex h-8 items-center justify-between",
  button_previous:
    "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40",
  button_next:
    "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40",
  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday: "w-9 text-[11px] font-medium uppercase text-muted-foreground",
  week: "mt-1 flex",
  day: "relative size-9 p-0 text-center",
  day_button:
    "inline-flex size-9 items-center justify-center rounded-lg tabular-nums outline-none transition hover:bg-brand-mist focus-visible:ring-2 focus-visible:ring-brand/40",
  today: "font-semibold text-teal-800",
  outside: "text-muted-foreground/50",
  disabled: "pointer-events-none text-muted-foreground/40",
  selected: "[&>button]:bg-brand-deep [&>button]:text-white [&>button]:hover:bg-brand-deep",
  range_start: "rounded-l-lg bg-brand-mist",
  range_end: "rounded-r-lg bg-brand-mist",
  range_middle: "bg-brand-mist [&>button]:!bg-transparent [&>button]:!text-brand-deep",
  hidden: "invisible",
};

function Calendario(props: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays
      classNames={CLASSES}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
      }}
      {...props}
    />
  );
}

function Gatilho({
  vazio,
  texto,
  placeholder,
  disabled,
  className,
  onLimpar,
  ...rest
}: {
  vazio: boolean;
  texto: string;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  onLimpar?: () => void;
  "aria-label"?: string;
}) {
  return (
    <Popover.Trigger
      disabled={disabled}
      aria-label={rest["aria-label"]}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-white px-2.5 text-left text-sm outline-none transition hover:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      <span className={cn("min-w-0 flex-1 truncate tabular-nums", vazio && "text-muted-foreground")}>
        {vazio ? placeholder : texto}
      </span>
      {!vazio && onLimpar && !disabled ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Limpar"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onLimpar();
          }}
        >
          <X className="size-3.5" />
        </span>
      ) : null}
    </Popover.Trigger>
  );
}

function Janela({ children }: { children: React.ReactNode }) {
  return (
    <Popover.Portal>
      <Popover.Positioner align="start" sideOffset={6} collisionPadding={12} className="z-[60] outline-none">
        <Popover.Popup className="origin-[var(--transform-origin)] rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0">
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

/** Uma data (yyyy-mm-dd). */
export function DatePicker({
  value,
  onChange,
  placeholder = "Escolha a data",
  disabled,
  clearable = true,
  className,
  "aria-label": ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const data = paraData(value);
  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Gatilho
        vazio={!data}
        texto={data ? curta(data) : ""}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        aria-label={ariaLabel}
        onLimpar={clearable ? () => onChange("") : undefined}
      />
      <Janela>
        <Calendario
          mode="single"
          selected={data}
          defaultMonth={data}
          onSelect={(d) => {
            onChange(d ? paraIso(d) : "");
            setAberto(false);
          }}
        />
      </Janela>
    </Popover.Root>
  );
}

/**
 * Intervalo (início e fim, yyyy-mm-dd). Um clique marca o início; o segundo,
 * o fim. Sem fim = um dia só.
 */
export function DateRangePicker({
  inicio,
  fim,
  onChange,
  placeholder = "Escolha o início e o fim",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  inicio: string | null | undefined;
  fim: string | null | undefined;
  onChange: (inicio: string, fim: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const de = paraData(inicio);
  const ate = paraData(fim);
  const range: DateRange | undefined = de ? { from: de, to: ate } : undefined;
  const dias = de && ate ? Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1 : 1;
  const texto = de
    ? ate && ate.getTime() !== de.getTime()
      ? `${curta(de)} a ${curta(ate)} · ${dias} dias`
      : `${curta(de)} · um dia`
    : "";

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Gatilho
        vazio={!de}
        texto={texto}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        aria-label={ariaLabel}
        onLimpar={() => onChange("", "")}
      />
      <Janela>
        <Calendario
          mode="range"
          selected={range}
          defaultMonth={de}
          numberOfMonths={1}
          onSelect={(r) => onChange(r?.from ? paraIso(r.from) : "", r?.to ? paraIso(r.to) : "")}
        />
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <span>{de ? texto : "Clique no início e depois no fim."}</span>
          <button
            type="button"
            className="rounded-md px-2 py-1 font-medium text-brand-deep hover:bg-muted"
            onClick={() => setAberto(false)}
          >
            Pronto
          </button>
        </div>
      </Janela>
    </Popover.Root>
  );
}
