"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

function IconBtn({
  href,
  label,
  badge,
  children,
}: {
  href: string;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[var(--navy)] transition hover:border-[var(--navy)] hover:bg-[var(--navy-soft)]"
    >
      {children}
      {badge != null && badge > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--navy)] px-1 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function PlanningProjectToolbar({
  projectId,
  reservationsCount = 0,
  moreSlot,
}: {
  projectId: string;
  reservationsCount?: number;
  /** Botões avançados (editar rubricas, readequação…) */
  moreSlot?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/planejamento/${projectId}/nf/nova`} className="btn gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M14 2v6h6M12 18v-6M9 15h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        NF / RPA
      </Link>

      <div className="flex items-center gap-1.5">
        <IconBtn
          href={`/planejamento/${projectId}/reservas`}
          label="Reservas"
          badge={reservationsCount}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </IconBtn>

        <IconBtn
          href={`/planejamento/${projectId}/pagamento-antecipado`}
          label="Pagamento sem NF"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect
              x="2"
              y="5"
              width="20"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M2 10h20"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </IconBtn>

        <IconBtn
          href={`/planejamento/${projectId}/importar-produtor`}
          label="Importar planilha do produtor"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconBtn>

        {moreSlot ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              title="Mais opções"
              aria-label="Mais opções"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[var(--navy)] transition hover:border-[var(--navy)] hover:bg-[var(--navy-soft)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="5" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="19" cy="12" r="1.5" fill="currentColor" />
              </svg>
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-20 mt-1.5 min-w-[14rem] rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg">
                <div
                  className="flex flex-col gap-1"
                  onClick={() => setMenuOpen(false)}
                >
                  {moreSlot}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
