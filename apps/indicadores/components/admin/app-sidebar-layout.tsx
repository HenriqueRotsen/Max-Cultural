"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  FolderTree,
  LogOut,
  MapPinned,
  ScrollText,
  Shield,
  Upload,
  UserRound,
  UserRoundSearch,
  Users,
  LayoutDashboard,
  X,
  ListChecks,
  FileCheck2,
} from "lucide-react";
import {
  MobileBottomNav,
  MobileTableCards,
  SidebarCollapseButton,
  useMobileMenu,
  useSidebarCollapsed,
} from "@max/mobile-nav";
import { BrandLogo } from "@/components/brand-logo";
import { PageBackLink } from "@/components/page-back-link";
import { buttonVariants } from "@/components/ui/button";
import { resolveBackFallback } from "@/lib/nav-back";
import { cn } from "@/lib/utils";

const HUB_URL = (process.env.NEXT_PUBLIC_CULTURAL_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const ACCOUNT_URL = `${HUB_URL}/conta`;

type NavItem = {
  href: string;
  label: string;
  match: (p: string) => boolean;
  /** Uma permissão ou qualquer uma da lista. */
  permission?: string | string[];
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: "operacao",
    label: "Operação",
    items: [
      {
        href: "/dashboard",
        label: "Base",
        match: (p) => p === "/dashboard",
        permission: "inscricoes:read",
        icon: LayoutDashboard,
      },
      {
        href: "/dashboard/analise",
        label: "Análise",
        match: (p) => p.startsWith("/dashboard/analise"),
        permission: "analise:read",
        icon: BarChart3,
      },
      {
        href: "/dashboard/acompanhamento",
        label: "Acompanhamento",
        match: (p) => p.startsWith("/dashboard/acompanhamento"),
        permission: "acompanhamento:read",
        icon: ListChecks,
      },
      {
        href: "/dashboard/prestacao",
        label: "Prestação de contas",
        match: (p) => p.startsWith("/dashboard/prestacao"),
        permission: "prestacao:read",
        icon: FileCheck2,
      },
      {
        href: "/dashboard/contextos",
        label: "Contextos",
        match: (p) => p.startsWith("/dashboard/contextos"),
        permission: "contextos:read",
        icon: FolderTree,
      },
      {
        href: "/dashboard/importar",
        label: "Importar",
        match: (p) => p.startsWith("/dashboard/importar"),
        permission: "import:write",
        icon: Upload,
      },
      {
        href: "/dashboard/formularios",
        label: "Formulários",
        match: (p) => p.startsWith("/dashboard/formularios"),
        permission: ["formularios:write", "formularios:review"],
        icon: ClipboardList,
      },
    ],
  },
  {
    id: "consultas",
    label: "Consultas",
    items: [
      {
        href: "/pessoa",
        label: "CPF",
        match: (p) => p.startsWith("/pessoa"),
        permission: "consultas:cpf",
        icon: UserRoundSearch,
      },
      {
        href: "/territorio",
        label: "Território",
        match: (p) => p.startsWith("/territorio"),
        permission: "consultas:territorio",
        icon: MapPinned,
      },
    ],
  },
  {
    id: "acesso",
    label: "Acesso",
    items: [
      {
        href: "/dashboard/acesso/usuarios",
        label: "Usuários",
        match: (p) => p.startsWith("/dashboard/acesso/usuarios"),
        permission: "usuarios:read",
        icon: Users,
      },
      {
        href: "/dashboard/acesso/papeis",
        label: "Papéis",
        match: (p) => p.startsWith("/dashboard/acesso/papeis"),
        permission: "roles:read",
        icon: Shield,
      },
      {
        href: "/dashboard/acesso/auditoria",
        label: "Auditoria",
        match: (p) => p.startsWith("/dashboard/acesso/auditoria"),
        permission: "audit:read",
        icon: ScrollText,
      },
    ],
  },
];

/** IAM de telas no hub Cultural; menu Acesso do Indicadores fica oculto por padrão. */
const hideAcesso = process.env.NEXT_PUBLIC_HIDE_INDICADORES_IAM !== "false";

function itemAllowed(
  permission: string | string[] | undefined,
  permissions: string[] | null,
): boolean {
  if (!permission || permissions === null) return true;
  const needed = Array.isArray(permission) ? permission : [permission];
  return needed.some((code) => permissions.includes(code));
}

function filterGroups(permissions: string[] | null): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (hideAcesso && group.id === "acesso") return false;
      return itemAllowed(item.permission, permissions);
    }),
  })).filter((group) => group.items.length > 0);
}

/** Ordem dos atalhos no rodapé do celular (até 4; o resto fica no menu). */
const MOBILE_PRIORITY = [
  "/dashboard",
  "/dashboard/contextos",
  "/dashboard/formularios",
  "/dashboard/importar",
  "/dashboard/analise",
  "/pessoa",
  "/territorio",
];

function mobileNavItems(permissions: string[] | null, pathname: string) {
  const items = filterGroups(permissions).flatMap((g) => g.items);
  const rank = (href: string) => {
    const i = MOBILE_PRIORITY.indexOf(href);
    return i === -1 ? MOBILE_PRIORITY.length : i;
  };
  return [...items]
    .sort((a, b) => rank(a.href) - rank(b.href))
    .map((item) => {
      const Icon = item.icon;
      return {
        href: item.href,
        label: item.label,
        icon: <Icon className="size-5" />,
        active: item.match(pathname),
      };
    });
}

function SidebarNav({
  permissions,
  onNavigate,
  collapsed = false,
}: {
  permissions: string[] | null;
  onNavigate?: () => void;
  /** Menu recolhido: só ícones (nome aparece ao passar o mouse). */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const groups = filterGroups(permissions);

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.id}>
          {collapsed ? null : (
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={item.label}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-[var(--navy-soft)] text-[var(--navy)]"
                        : "text-[var(--gray-600)] hover:bg-[var(--gray-50)] hover:text-[var(--navy)]",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-[var(--navy)]" : "text-[var(--gray-400)]",
                      )}
                    />
                    {collapsed ? null : item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarPanel({
  permissions,
  userEmail,
  homeHref = "/dashboard",
  onNavigate,
  className,
  collapsed = false,
  onToggleCollapse,
}: {
  permissions: string[] | null;
  userEmail: string;
  homeHref?: string;
  onNavigate?: () => void;
  className?: string;
  /** Só no computador: menu estreito com ícones. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-[var(--border)] bg-white transition-[width] duration-150",
        collapsed ? "w-[68px]" : "w-[240px]",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 py-5",
          collapsed ? "justify-center px-0" : "justify-between px-5",
        )}
      >
        {collapsed ? null : (
          <BrandLogo
            href={homeHref}
            className="min-w-0"
          />
        )}
        {onToggleCollapse ? (
          <SidebarCollapseButton
            collapsed={collapsed}
            onToggle={onToggleCollapse}
            className="md:!inline-flex"
          />
        ) : null}
      </div>

      <SidebarNav permissions={permissions} onNavigate={onNavigate} collapsed={collapsed} />
      <div className="px-3 pb-3">
        <a
          href={HUB_URL}
          className={cn(
            "flex items-center overflow-hidden rounded-xl py-2.5 transition hover:opacity-95",
            collapsed ? "justify-center px-1" : "px-3",
          )}
          style={{
            /* Mix da logo Cultural: laranja + teal + roxo */
            background:
              "linear-gradient(135deg, #fff4e6 0%, #e6f9fb 48%, #f3eefc 100%)",
            boxShadow: "0 0 0 1px #f0702040, 0 0 0 1px #00a0b033",
          }}
          aria-label="Voltar ao MAX Cultural"
        >
          <img
            src="/brand/max-cultural.png"
            alt="MAX Cultural"
            width={1531}
            height={571}
            className={cn(
              "h-7 bg-transparent object-left",
              collapsed ? "w-7 max-w-7 object-cover" : "w-auto max-w-[9rem] object-contain",
            )}
          />
        </a>
      </div>

      <div className={cn("border-t border-[var(--border)] py-4 space-y-3", collapsed ? "px-3" : "px-5")}>
        {userEmail && !collapsed ? (
          <p className="truncate text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
        ) : null}
        <a
          href={ACCOUNT_URL}
          title="Minha conta"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full gap-2",
            collapsed ? "justify-center px-0" : "justify-start",
          )}
        >
          <UserRound className="size-3.5" />
          {collapsed ? null : "Minha conta"}
        </a>
        <a
          href="/sair"
          title="Sair"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full gap-2",
            collapsed ? "justify-center px-0" : "justify-start",
          )}
        >
          <LogOut className="size-3.5" />
          {collapsed ? null : "Sair"}
        </a>
      </div>
    </aside>
  );
}

export type AppSidebarLayoutProps = {
  userEmail: string;
  /** codes de permissão; null = mostrar tudo */
  permissions: string[] | null;
  /** Destino do logo (professores → formulários). */
  homeHref?: string;
  title?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  mainClassName?: string;
  contentClassName?: string;
};

/** Layout autenticado: sidebar fixa (desktop) + drawer (mobile). */
export function AppSidebarLayout({
  userEmail,
  permissions,
  homeHref = "/dashboard",
  title: _title,
  actions,
  backHref,
  backLabel,
  children,
  mainClassName,
  contentClassName,
}: AppSidebarLayoutProps) {
  const pathname = usePathname();
  const menu = useMobileMenu(pathname);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const mobileOpen = menu.open;
  const setMobileOpen = menu.setOpen;
  const autoBack = resolveBackFallback(pathname);
  const back =
    backHref != null
      ? { href: backHref, label: backLabel ?? "Voltar" }
      : autoBack;

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-30 hidden md:block">
        <SidebarPanel
          permissions={permissions}
          userEmail={userEmail}
          homeHref={homeHref}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-brand-deep/25 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 shadow-xl animate-in slide-in-from-left duration-200">
            <SidebarPanel
              permissions={permissions}
              userEmail={userEmail}
              homeHref={homeHref}
              onNavigate={() => setMobileOpen(false)}
              className="relative"
            />
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-brand-mist hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "pb-[calc(4.4rem+env(safe-area-inset-bottom))] transition-[padding] duration-150 md:pb-0",
          collapsed ? "md:pl-[68px]" : "md:pl-[240px]",
        )}
      >
        {actions ? (
          <div className="flex justify-end px-4 pt-4 sm:px-6 md:pt-6">
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          </div>
        ) : null}

        <main
          className={cn(
            "px-4 py-6 sm:px-6",
            contentClassName,
            mainClassName,
          )}
        >
          {back ? (
            <div className="mb-4">
              <PageBackLink href={back.href} label={back.label} />
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <div className="md:hidden">
        <MobileBottomNav
          items={mobileNavItems(permissions, pathname)}
          menuOpen={mobileOpen}
          onMenuToggle={menu.toggle}
        />
      </div>
      <MobileTableCards />
    </div>
  );
}
