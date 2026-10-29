"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type FieldHelpProps = {
  text: string;
};

type BubblePos = {
  top: number;
  left: number;
  placement: "above" | "below";
};

const GAP = 8;
const MAX_WIDTH = 280;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Círculo com “?” — tooltip via portal (não é cortado por overflow de tabelas). */
export function FieldHelp({ text }: FieldHelpProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<BubblePos | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    const rect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(bubbleRect.width || MAX_WIDTH, Math.min(MAX_WIDTH, vw - 16));

    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;
    const preferAbove = spaceAbove >= bubbleRect.height + GAP || spaceAbove >= spaceBelow;
    const placement: "above" | "below" = preferAbove ? "above" : "below";

    const top =
      placement === "above"
        ? rect.top - GAP - (bubbleRect.height || 0)
        : rect.bottom + GAP;

    const left = clamp(rect.left + rect.width / 2 - width / 2, 8, vw - width - 8);

    setPos({ top, left, placement });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    const id = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(id);
  }, [open, text, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onScrollOrResize() {
      updatePosition();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, updatePosition]);

  const bubble =
    mounted && open
      ? createPortal(
          <span
            ref={bubbleRef}
            id={tooltipId}
            className={`field-help-bubble field-help-bubble-portal${pos ? " is-open" : ""}`}
            role="tooltip"
            style={
              pos
                ? {
                    top: pos.top,
                    left: pos.left,
                  }
                : undefined
            }
            data-placement={pos?.placement || "above"}
          >
            {text}
          </span>,
          document.body,
        )
      : null;

  return (
    <span className="field-help">
      <button
        ref={triggerRef}
        type="button"
        className="field-help-trigger"
        aria-label="Ajuda"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {bubble}
    </span>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  help,
}: {
  htmlFor?: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="field-label-row">
      <span>{children}</span>
      {help ? <FieldHelp text={help} /> : null}
    </label>
  );
}

/** Rótulo inline (checkbox, título de seção) com ajuda. */
export function InlineHelpLabel({
  children,
  help,
}: {
  children: ReactNode;
  help: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <FieldHelp text={help} />
    </span>
  );
}

/** Cabeçalho de tabela com ajuda. */
export function ThHelp({
  children,
  help,
  className,
}: {
  children: ReactNode;
  help: string;
  className?: string;
}) {
  return (
    <th className={className}>
      <span className="th-help">
        <span>{children}</span>
        <FieldHelp text={help} />
      </span>
    </th>
  );
}
