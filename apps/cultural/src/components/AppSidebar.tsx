"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderIcon,
  HomeIcon,
  ListIcon,
  MobileBottomNav,
  MobileTableCards,
  ShieldIcon,
  SidebarCollapseButton,
  UsersIcon,
  useMobileMenu,
  useSidebarCollapsed,
} from "@max/mobile-nav";
import { MaxCulturalLogo } from "@/components/BrandLogo";

const MOBILE_ICONS: Record<string, () => React.ReactNode> = {
  "/": HomeIcon,
  "/projetos": FolderIcon,
  "/usuarios": UsersIcon,
  "/papeis": ShieldIcon,
  "/logs": ListIcon,
};

function hubLinkActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

const hubLinks = [
  { href: "/", label: "Início" },
  { href: "/projetos", label: "Projetos" },
  { href: "/usuarios", label: "Usuários" },
  { href: "/papeis", label: "Papéis" },
  { href: "/logs", label: "Logs" },
];

export function AppSidebar({
  userEmail,
  canUsers,
  canRoles,
  canLogs,
  canFinanceiro,
  canIndicadores,
  indicadoresFormulariosOnly,
  financeiroUrl,
  indicadoresUrl,
  auditoriaUrl,
}: {
  userEmail?: string;
  canProjetos?: boolean;
  canUsers?: boolean;
  canRoles?: boolean;
  canLogs?: boolean;
  canFinanceiro?: boolean;
  canIndicadores?: boolean;
  /** Papel Professor: só avaliação de formulários. */
  indicadoresFormulariosOnly?: boolean;
  financeiroUrl?: string;
  indicadoresUrl?: string;
  /** App MAX Auditoria (antigo Salink); vazio = sem atalho. */
  auditoriaUrl?: string;
}) {
  const pathname = usePathname();
  const visible = hubLinks.filter((l) => {
    if (l.href === "/projetos") return true;
    if (l.href === "/usuarios") return canUsers;
    if (l.href === "/papeis") return canRoles;
    if (l.href === "/logs") return canLogs;
    return true;
  });

  const financeiroHref = `${(financeiroUrl || "http://localhost:3001").replace(/\/$/, "")}/painel`;
  const indicadoresBase = (indicadoresUrl || "http://localhost:3002").replace(/\/$/, "");
  const indicadoresHref = indicadoresFormulariosOnly
    ? `${indicadoresBase}/dashboard/formularios`
    : `${indicadoresBase}/dashboard`;
  const auditoriaHref = auditoriaUrl ? `${auditoriaUrl.replace(/\/$/, "")}/inicio` : "";
  const showProducts = Boolean(canFinanceiro || canIndicadores || auditoriaHref);

  const menu = useMobileMenu(pathname);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const mobileItems = visible.map((link) => {
    const Icon = MOBILE_ICONS[link.href] ?? HomeIcon;
    return {
      href: link.href,
      label: link.label,
      icon: <Icon />,
      active: hubLinkActive(pathname, link.href),
    };
  });

  return (
    <>
    <aside
      className="shell-sidebar"
      data-mx-drawer
      data-open={menu.open ? "true" : undefined}
      data-mx-collapsed={collapsed ? "" : undefined}
    >
      <div className="mx-sidebar-head flex items-center justify-between gap-2 px-5 py-5">
        <span className="mx-nav-label">
          <MaxCulturalLogo />
        </span>
        <SidebarCollapseButton collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-4">
        <p className="mx-nav-label px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        {visible.map((link) => {
          const active = hubLinkActive(pathname, link.href);
          const Icon = MOBILE_ICONS[link.href] ?? HomeIcon;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-[var(--navy-soft)] text-[var(--navy)]"
                  : "text-[var(--gray-600)] hover:bg-[var(--gray-50)] hover:text-[var(--navy)]"
              }`}
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]">
                <Icon />
              </span>
              <span className="mx-nav-label">{link.label}</span>
            </Link>
          );
        })}

        {showProducts ? (
          <>
            <p className="mx-nav-label px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
              Produtos
            </p>
            {canFinanceiro ? (
              <a
                href={financeiroHref}
                className="mx-brand-chip flex items-center overflow-hidden rounded-xl px-3 py-2.5 transition hover:opacity-95"
                style={{
                  background: "linear-gradient(165deg, #f5f3ff 0%, #fff 70%)",
                  boxShadow: "0 0 0 1px #c4b5fd55",
                }}
              >
                <img
                  src="/brand/max-financeiro.png"
                  alt="MAX Financeiro"
                  className="h-7 w-auto max-w-[9rem] object-contain object-left"
                />
              </a>
            ) : null}
            {canIndicadores ? (
              <a
                href={indicadoresHref}
                className="mx-brand-chip mt-1 flex items-center overflow-hidden rounded-xl px-3 py-2.5 transition hover:opacity-95"
                style={{
                  background: "linear-gradient(165deg, #f0fdfa 0%, #fff 70%)",
                  boxShadow: "0 0 0 1px #5eead455",
                }}
              >
                <img
                  src="/brand/max-indicadores.png"
                  alt="MAX Indicadores"
                  className="h-7 w-auto max-w-[9rem] object-contain object-left"
                />
              </a>
            ) : null}
            {auditoriaHref ? (
              <a
                href={auditoriaHref}
                className="mx-brand-chip mt-1 flex items-center overflow-hidden rounded-xl px-3 py-2.5 transition hover:opacity-95"
                style={{
                  background: "linear-gradient(165deg, #eff6ff 0%, #fff 70%)",
                  boxShadow: "0 0 0 1px #93c5fd55",
                }}
              >
                <img
                  src="/brand/max-auditoria.png"
                  alt="MAX Auditoria"
                  className="h-7 w-auto max-w-[9rem] object-contain object-left"
                />
              </a>
            ) : null}
          </>
        ) : null}
      </nav>
      <div className="mx-sidebar-foot mt-auto border-t border-[var(--border)] px-5 py-4 space-y-3">
        {userEmail ? (
          <p className="mx-nav-label truncate text-xs text-[var(--gray-500)]" title={userEmail}>
            {userEmail}
          </p>
        ) : null}
        <Link
          href="/conta"
          title="Minha conta"
          className={`mx-nav-icon-link btn btn-ghost w-full justify-start gap-2 px-0 ${
            pathname === "/conta" || pathname.startsWith("/conta/")
              ? "bg-[var(--navy-soft)]"
              : ""
          }`}
        >
          <AccountIcon />
          <span className="mx-nav-label">Minha conta</span>
        </Link>
        {/* <a> e não <Link>: o prefetch do Next chamaria /logout e encerraria a sessão. */}
        <a
          href="/logout"
          title="Sair"
          className="mx-nav-icon-link btn btn-ghost w-full justify-start gap-2 px-0"
        >
          <LogoutIcon />
          <span className="mx-nav-label">Sair</span>
        </a>
      </div>
    </aside>
    <MobileBottomNav items={mobileItems} menuOpen={menu.open} onMenuToggle={menu.toggle} />
    <MobileTableCards />
    </>
  );
}

function AccountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
