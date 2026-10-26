"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

export type MobileNavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  badge?: number;
  /** Outro app (link absoluto): navegação completa. */
  external?: boolean;
};

/**
 * Estado do menu lateral no celular. Fecha sozinho quando a rota muda
 * (estado derivado da rota, sem efeito), com Esc e trava a rolagem da página.
 */
export function useMobileMenu(pathname: string) {
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  useEffect(() => {
    if (!open) return;
    document.body.setAttribute("data-mx-menu-open", "");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.removeAttribute("data-mx-menu-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return {
    open,
    setOpen: (next: boolean) => setOpenAt(next ? pathname : null),
    toggle: () => setOpenAt(open ? null : pathname),
  };
}

/**
 * No celular, toda <table> vira lista de cartões (CSS em mobile-nav.css): a primeira
 * coluna com texto é o título do cartão e as demais aparecem como "rótulo: valor".
 * Aqui só copiamos o texto do cabeçalho para `data-label` de cada célula; tabelas
 * de edição (planilhas) ficam como estão com `data-mx-keep-table`.
 */
export function MobileTableCards() {
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      for (const table of document.querySelectorAll("table")) {
        if (table.closest("[data-mx-keep-table]")) continue;
        const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
        if (!headRow) continue;
        const labels: string[] = [];
        for (const th of headRow.cells) {
          const text = (th.textContent ?? "").replace(/\s+/g, " ").trim();
          for (let i = 0; i < (th.colSpan || 1); i++) labels.push(text);
        }
        if (!table.hasAttribute("data-mx-cards")) table.setAttribute("data-mx-cards", "");
        const sections = [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])];
        for (const section of sections) {
          for (const row of section.rows) {
            let col = 0;
            let titled = false;
            for (const cell of row.cells) {
              const label = row.cells.length === 1 || cell.colSpan > 1 ? "" : (labels[col] ?? "");
              if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
              const isTitle = !titled && label !== "" && (cell.textContent ?? "").trim() !== "";
              if (isTitle) titled = true;
              if (isTitle !== cell.hasAttribute("data-mx-title")) {
                cell.toggleAttribute("data-mx-title", isTitle);
              }
              col += cell.colSpan || 1;
            }
          }
        }
      }
    };
    apply();
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}

/** Até 4 atalhos + "Menu"; quando há mais, o resto fica no menu lateral. */
export function MobileBottomNav({
  items,
  menuOpen,
  onMenuToggle,
  menuLabel = "Menu",
}: {
  items: MobileNavItem[];
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuLabel?: string;
}) {
  const shown = items.slice(0, 4);
  const menuActive = menuOpen || (!shown.some((i) => i.active) && items.some((i) => i.active));
  return (
    <>
      {menuOpen ? (
        <button
          type="button"
          className="mx-mnav-backdrop"
          aria-label="Fechar menu"
          onClick={onMenuToggle}
        />
      ) : null}
      <nav className="mx-mnav" aria-label="Navegação principal">
        {shown.map((item) => {
          const inner = (
            <>
              <span className="mx-mnav__icon" aria-hidden>
                {item.icon}
              </span>
              <span className="mx-mnav__label">{item.label}</span>
              {item.badge ? (
                <span className="mx-mnav__badge">{item.badge > 99 ? "99+" : item.badge}</span>
              ) : null}
            </>
          );
          return item.external ? (
            <a
              key={item.href}
              href={item.href}
              className="mx-mnav__item"
              data-active={item.active ? "true" : undefined}
            >
              {inner}
            </a>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className="mx-mnav__item"
              data-active={item.active ? "true" : undefined}
              aria-current={item.active ? "page" : undefined}
            >
              {inner}
            </Link>
          );
        })}
        <button
          type="button"
          className="mx-mnav__item"
          data-active={menuActive ? "true" : undefined}
          aria-expanded={menuOpen}
          onClick={onMenuToggle}
        >
          <span className="mx-mnav__icon" aria-hidden>
            <MenuIcon />
          </span>
          <span className="mx-mnav__label">{menuLabel}</span>
        </button>
      </nav>
    </>
  );
}

function svg(children: ReactNode) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function MenuIcon() {
  return svg(<path d="M4 7h16M4 12h16M4 17h16" />);
}

export function HomeIcon() {
  return svg(<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z" />);
}

export function FolderIcon() {
  return svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />);
}

export function UsersIcon() {
  return svg(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 18.5c.8-2.6 2.9-4 5.5-4s4.7 1.4 5.5 4" />
      <circle cx="17" cy="9" r="2.2" />
    </>,
  );
}

export function ShieldIcon() {
  return svg(<path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />);
}

export function ListIcon() {
  return svg(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />);
}
