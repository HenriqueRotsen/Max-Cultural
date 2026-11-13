"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const menuItemClass =
  "block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)]";

/**
 * Ações do projeto. Ficam à vista só as do dia a dia, com nome:
 * Nova reserva (principal, escolhe o tipo), Reservas e Pendências. O resto (pedidos, planilha
 * do produtor, planilhas do SALIC, rubricas e readequação) vai para "Mais".
 */
export function PlanningProjectToolbar({
  projectId,
  reservationsCount = 0,
  pendenciasCount = 0,
  pendenciasLate = 0,
  showSheetVersions = false,
  moreSlot,
  menuOpen: controlledMenuOpen,
  onMenuOpenChange,
}: {
  projectId: string;
  reservationsCount?: number;
  /** Pendências financeiras e de comprovação do projeto (o botão fica sempre à vista). */
  pendenciasCount?: number;
  /** Quantas estão atrasadas (o botão fica vermelho). */
  pendenciasLate?: number;
  /** Mostra "Planilhas do SALIC" no menu (há versões guardadas). */
  showSheetVersions?: boolean;
  /** Ações avançadas (editar rubricas, readequação…), no fim do menu. */
  moreSlot?: ReactNode;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const [internalMenuOpen, setInternalMenuOpen] = useState(false);
  const menuOpen = controlledMenuOpen ?? internalMenuOpen;
  const setMenuOpen = onMenuOpenChange ?? setInternalMenuOpen;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, setMenuOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/planejamento/${projectId}/reservas/nova`} className="btn gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Nova reserva
      </Link>

      <Link href={`/planejamento/${projectId}/reservas`} className="btn btn-ghost gap-2">
        Reservas
        {reservationsCount > 0 ? (
          <span className="rounded-full bg-[var(--navy)] px-1.5 text-[11px] font-bold leading-5 text-white">
            {reservationsCount > 99 ? "99+" : reservationsCount}
          </span>
        ) : null}
      </Link>

      <Link
        href={`/planejamento/${projectId}/pendencias`}
        className={`btn btn-ghost gap-2 ${
          pendenciasLate > 0
            ? "border-red-300 bg-red-50 text-red-800"
            : pendenciasCount > 0
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : ""
        }`}
        title={
          pendenciasLate > 0
            ? `${pendenciasLate} atrasada(s)`
            : "O que falta pagar, comprovar ou enviar ao SALIC"
        }
      >
        Pendências
        {pendenciasCount > 0 ? (
          <span
            className={`rounded-full px-1.5 text-[11px] font-bold leading-5 text-white ${
              pendenciasLate > 0 ? "bg-red-600" : "bg-amber-600"
            }`}
          >
            {pendenciasCount > 99 ? "99+" : pendenciasCount}
          </span>
        ) : null}
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
          className="btn btn-ghost gap-1.5"
        >
          Mais
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute left-0 z-20 mt-1.5 min-w-[15rem] rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg sm:left-auto sm:right-0"
          >
            <div className="flex flex-col gap-1">
              <Link href={`/planejamento/${projectId}/pedidos`} className={menuItemClass}>
                Contratos e parcelamentos
              </Link>
              <Link
                href={`/planejamento/${projectId}/importar-produtor`}
                className={menuItemClass}
              >
                Importar planilha do produtor
              </Link>
              {showSheetVersions ? (
                <Link href={`/planejamento/${projectId}/planilhas`} className={menuItemClass}>
                  Planilhas do SALIC
                </Link>
              ) : null}
              {moreSlot ? (
                <>
                  <hr className="my-1 border-[var(--border)]" />
                  {moreSlot}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
