"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type BubblePos = {
  top: number;
  left: number;
  placement: "above" | "below";
};

const GAP = 8;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Posiciona um balão (via portal, `position: fixed`) acima ou abaixo do gatilho,
 * dentro da tela. Fecha com Esc e acompanha scroll/resize.
 */
export function useAnchoredBubble<T extends HTMLElement>(maxWidth: number, contentKey?: unknown) {
  const triggerRef = useRef<T>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
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
    const width = Math.min(bubbleRect.width || maxWidth, Math.min(maxWidth, vw - 16));

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
  }, [maxWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    const id = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(id);
  }, [open, contentKey, updatePosition]);

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

  return { triggerRef, bubbleRef, open, setOpen, mounted, pos };
}
