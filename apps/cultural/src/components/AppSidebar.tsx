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
  UsersIcon,
  useMobileMenu,
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
    <aside className="shell-sidebar" data-mx-drawer data-open={menu.open ? "true" : undefined}>
      <div className="flex items-center px-5 py-5">
        <MaxCulturalLogo />
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-4">
        <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        {visible.map((link) => {
          const active = hubLinkActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-[var(--navy-soft)] text-[var(--navy)]"
                  : "text-[var(--gray-600)] hover:bg-[var(--gray-50)] hover:text-[var(--navy)]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}

        {showProducts ? (
          <>
            <p className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
              Produtos
            </p>
            {canFinanceiro ? (
              <a
                href={financeiroHref}
                className="flex items-center rounded-xl px-3 py-2.5 transition hover:opacity-95"
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
                className="mt-1 flex items-center rounded-xl px-3 py-2.5 transition hover:opacity-95"
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
                className="mt-1 flex items-center rounded-xl px-3 py-2.5 transition hover:opacity-95"
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
      <div className="mt-auto border-t border-[var(--border)] px-5 py-4 space-y-3">
        {userEmail ? (
          <p className="truncate text-xs text-[var(--gray-500)]" title={userEmail}>
            {userEmail}
          </p>
        ) : null}
        <Link
          href="/conta"
          className={`btn btn-ghost w-full justify-start px-0 ${
            pathname === "/conta" || pathname.startsWith("/conta/")
              ? "bg-[var(--navy-soft)]"
              : ""
          }`}
        >
          Minha conta
        </Link>
        {/* <a> e não <Link>: o prefetch do Next chamaria /logout e encerraria a sessão. */}
        <a href="/logout" className="btn btn-ghost w-full justify-start px-0">
          Sair
        </a>
      </div>
    </aside>
    <MobileBottomNav items={mobileItems} menuOpen={menu.open} onMenuToggle={menu.toggle} />
    <MobileTableCards />
    </>
  );
}
