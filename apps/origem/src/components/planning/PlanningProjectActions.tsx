"use client";

import { useState } from "react";
import { PlanningProjectToolbar } from "@/components/planning/PlanningProjectToolbar";
import {
  EditRubricsPanel,
  type EditableRubricLine,
} from "@/components/planning/EditRubricsPanel";
import { ReadequacaoActions } from "@/components/planning/ReadequacaoActions";

export function PlanningProjectActions({
  projectId,
  reservationsCount,
  allowExceed,
  allowReadequacao,
  isFederal,
  openDraftId,
  expiresAt,
  editableLines,
  totalApproved,
}: {
  projectId: string;
  reservationsCount: number;
  allowExceed: boolean;
  allowReadequacao: boolean;
  isFederal: boolean;
  openDraftId: string | null;
  expiresAt: string | null;
  editableLines: EditableRubricLine[];
  totalApproved: number;
}) {
  const [editRubricsOpen, setEditRubricsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasAdvancedTools = allowExceed || allowReadequacao;

  return (
    <>
      <PlanningProjectToolbar
        projectId={projectId}
        reservationsCount={reservationsCount}
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        moreSlot={
          hasAdvancedTools ? (
            <>
              {allowExceed ? (
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setEditRubricsOpen(true);
                  }}
                >
                  Editar rubricas
                </button>
              ) : null}
              {allowReadequacao ? (
                <ReadequacaoActions
                  planningProjectId={projectId}
                  openDraftId={openDraftId}
                  expiresAt={expiresAt}
                  isFederal={isFederal}
                  menuItem
                  onAction={() => setMenuOpen(false)}
                />
              ) : null}
            </>
          ) : undefined
        }
      />

      {allowExceed ? (
        <EditRubricsPanel
          planningProjectId={projectId}
          totalApproved={totalApproved}
          lines={editableLines}
          open={editRubricsOpen}
          onOpenChange={setEditRubricsOpen}
          hideTrigger
        />
      ) : null}
    </>
  );
}
