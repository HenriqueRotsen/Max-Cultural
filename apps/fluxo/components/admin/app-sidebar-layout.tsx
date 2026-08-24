"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FolderTree,
  LogOut,
  MapPinned,
  Menu,
  ScrollText,
  Shield,
  Upload,
  UserRound,
  UserRoundSearch,
  Users,
  LayoutDashboard,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import { Button, buttonVariants } from "@/components/ui/button";
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
  permission?: string;
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

const hideAcesso = process.env.NEXT_PUBLIC_HIDE_FLUXO_IAM !== "false";

function filterGroups(permissions: string[] | null): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (hideAcesso && group.id === "acesso") return false;
      if (!item.permission || permissions === null) return true;
      return permissions.includes(item.permission);
    }),
  })).filter((group) => group.items.length > 0);
}

function SidebarNav({
  permissions,
  onNavigate,
}: {
  permissions: string[] | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = filterGroups(permissions);

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
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
                    {item.label}
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
  onNavigate,
  className,
}: {
  permissions: string[] | null;
  userEmail: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex h-full w-[240px] flex-col border-r border-[var(--border)] bg-white",
        className,
      )}
    >
      <div className="flex items-center px-5 py-5">
        <BrandLogo
          href="/dashboard"
          className="min-w-0"
        />
      </div>

      <SidebarNav permissions={permissions} onNavigate={onNavigate} />
      <div className="px-3 pb-3">
        <a
          href={HUB_URL}
          className="flex items-center rounded-lg px-2.5 py-2 transition-colors hover:bg-brand-mist"
          aria-label="Voltar ao MAX Cultural"
        >
          <img
            src="/brand/max-cultural.png"
            alt="MAX Cultural"
            width={1531}
            height={571}
            className="h-9 w-auto max-w-[180px] bg-transparent object-contain object-left"
          />
        </a>
      </div>

      <div className="border-t border-[var(--border)] px-5 py-4 space-y-3">
        {userEmail ? (
          <p className="truncate text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
        ) : null}
        <a
          href={ACCOUNT_URL}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full justify-start gap-2")}
        >
          <UserRound className="size-3.5" />
          Minha conta
        </a>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
          >
            <LogOut className="size-3.5" />
            Sair
          </Button>
        </form>
      </div>
    </aside>
  );
}

export type AppSidebarLayoutProps = {
  userEmail: string;
  /** codes de permissão; null = mostrar tudo */
  permissions: string[] | null;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
  contentClassName?: string;
};

/** Layout autenticado: sidebar fixa (desktop) + drawer (mobile). */
export function AppSidebarLayout({
  userEmail,
  permissions,
  title: _title,
  actions,
  children,
  mainClassName,
  contentClassName,
}: AppSidebarLayoutProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-30 hidden md:block">
        <SidebarPanel
          permissions={permissions}
          userEmail={userEmail}
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

      <div className="md:pl-[240px]">
        {/* Só no mobile: abrir o menu lateral */}
        <div className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-brand/10 bg-white/70 px-4 backdrop-blur-md md:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <BrandLogo />
          {actions ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div className="hidden justify-end px-4 pt-6 sm:px-6 md:flex">
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
          {children}
        </main>
      </div>
    </div>
  );
}
