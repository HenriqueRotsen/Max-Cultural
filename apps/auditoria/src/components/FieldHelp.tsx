"use client";

import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchoredBubble } from "@/components/useAnchoredBubble";

type FieldHelpProps = {
  text: string;
};

const MAX_WIDTH = 280;

/** Círculo com “?” — tooltip via portal (não é cortado por overflow de tabelas). */
export function FieldHelp({ text }: FieldHelpProps) {
  const tooltipId = useId();
  const { triggerRef, bubbleRef, open, setOpen, mounted, pos } =
    useAnchoredBubble<HTMLButtonElement>(MAX_WIDTH, text);

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
