"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleBudgetHierarchyLockAction } from "@/lib/planning/actions";
import type { HierarchyLockLevel } from "@/lib/planning/hierarchy-lock";

function LockIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 11V8a5 5 0 0 1 9.9-1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect
          x="5"
          y="11"
          width="14"
          height="10"
          rx="2"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function HierarchyLockButton({
  planningProjectId,
  sheetId,
  level,
  path,
  locked,
  exactLocked,
  canToggle,
}: {
  planningProjectId: string;
  sheetId: string;
  level: HierarchyLockLevel;
  path: {
    fonteRecurso?: string;
    productName?: string;
    stageName?: string;
    state?: string;
    city?: string;
    budgetLineId?: string;
  };
  /** Bloqueado por este nó ou ancestral. */
  locked: boolean;
  /** Cadeado exatamente neste escopo. */
  exactLocked: boolean;
  canToggle: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!canToggle && !locked) return null;

  const title = locked
    ? exactLocked
      ? "Desbloquear este nível (edições e uso de saldo liberados)"
      : "Bloqueado por um nível superior"
    : "Bloquear este nível (impede edições e uso de saldo)";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={pending || !canToggle || (locked && !exactLocked)}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition ${
        locked
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-transparent text-[var(--gray-400)] hover:border-[var(--border)] hover:bg-white hover:text-[var(--navy)]"
      } disabled:cursor-not-allowed disabled:opacity-60`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canToggle || (locked && !exactLocked)) return;
        start(async () => {
          const result = await toggleBudgetHierarchyLockAction({
            planningProjectId,
            sheetId,
            level,
            ...path,
          });
          if (result.error) {
            window.alert(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <LockIcon open={!locked} />
    </button>
  );
}
