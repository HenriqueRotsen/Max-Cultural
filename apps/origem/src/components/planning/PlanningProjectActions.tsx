"use client";

import { useState } from "react";
import { PlanningProjectToolbar } from "@/components/planning/PlanningProjectToolbar";
import {
  EditRubricsPanel,
  type EditableRubricLine,
} from "@/components/planning/EditRubricsPanel";
import { ReadequacaoActions } from "@/components/planning/ReadequacaoActions";
import { LegalDossierButton } from "@/components/LegalDossierButton";

export function PlanningProjectActions({
  projectId,
  accountId,
  auditProjectId,
  reservationsCount,
  allowEditRubricas,
  allowReadequacao,
  isFederal,
  openDraftId,
  expiresAt,
  editableLines,
  totalApproved,
}: {
  projectId: string;
  accountId: string;
  /** Project.id (auditoria SALIC) — necessário para o dossiê deste PRONAC */
  auditProjectId: string | null;
  reservationsCount: number;
  allowEditRubricas: boolean;
  allowReadequacao: boolean;
  isFederal: boolean;
  openDraftId: string | null;
  expiresAt: string | null;
  editableLines: EditableRubricLine[];
  totalApproved: number;
}) {
  const [editRubricsOpen, setEditRubricsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasAdvancedTools = allowEditRubricas || allowReadequacao;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <PlanningProjectToolbar
          projectId={projectId}
          reservationsCount={reservationsCount}
          menuOpen={menuOpen}
          onMenuOpenChange={setMenuOpen}
          moreSlot={
            hasAdvancedTools ? (
              <>
                {allowEditRubricas ? (
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
        <LegalDossierButton
          accountId={accountId}
          projectId={auditProjectId}
          variant="ghost"
          label="Gerar Dossiê de Auditoria (Backup)"
          disabledReason={
            auditProjectId
              ? null
              : "Vincule este planejamento a um PRONAC da auditoria para gerar o dossiê."
          }
        />
      </div>

      {allowEditRubricas ? (
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
