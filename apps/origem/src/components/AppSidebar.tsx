"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MaxOrigemLogo } from "@/components/SalinkLogo";
import { signOut } from "@/lib/auth/actions";

const auditoriaLinks = [
  { href: "/painel", label: "Início", icon: HomeIcon },
  { href: "/panorama", label: "Insights", icon: ChartIcon },
  { href: "/panorama/pronac", label: "Por PRONAC", icon: PronacIcon },
  { href: "/auditoria", label: "Relatório de Auditoria", icon: AuditIcon },
  { href: "/comparar", label: "Comparar", icon: CompareIcon },
  { href: "/contas", label: "Contas", icon: BuildingIcon },
  { href: "/sync", label: "Atualizar", icon: SyncIcon },
];

const fornecedoresLinks = [
  { href: "/fornecedores", label: "Banco de fornecedores", icon: UsersIcon },
  { href: "/contas/mapa", label: "Mapa societário", icon: MapIcon },
];

function linkActive(pathname: string, href: string) {
  if (href === "/painel") return pathname === "/painel";
  if (href === "/panorama") {
    return pathname === "/panorama" || /^\/panorama\/(?!pronac(?:\/|$))/.test(pathname);
  }
  if (href === "/contas") {
    return pathname === "/contas" || (pathname.startsWith("/contas/") && !pathname.startsWith("/contas/mapa"));
  }
  if (href === "/contas/mapa") {
    return pathname === "/contas/mapa" || pathname.startsWith("/contas/mapa/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  userEmail,
  syncEnabled = true,
  planLabel,
  demoMode = false,
}: {
  userEmail?: string;
  isAdmin?: boolean;
  syncEnabled?: boolean;
  planLabel?: string;
  demoMode?: boolean;
}) {
  const pathname = usePathname();
  const auditoria = auditoriaLinks.filter((l) => {
    if (!syncEnabled && l.href === "/sync") return false;
    if (demoMode && (l.href === "/sync" || l.href === "/contas")) return false;
    return true;
  });

  return (
    <aside className="shell-sidebar">
      <div className="flex items-center px-5 py-5">
        <Link href="/painel" className="block">
          <MaxOrigemLogo />
        </Link>
      </div>

      <nav className="flex-1 space-y-4 px-3 pb-4">
        <NavGroup title="Auditoria" links={auditoria} pathname={pathname} />
        {!demoMode ? (
          <NavGroup title="Fornecedores" links={fornecedoresLinks} pathname={pathname} />
        ) : null}
      </nav>

      <div className="mt-auto border-t border-[var(--border)] px-5 py-4 space-y-3">
        {planLabel && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--gold)]">
            Plano {planLabel}
          </p>
        )}
        {userEmail && (
          <p className="truncate text-xs text-[var(--gray-500)]" title={userEmail}>
            {userEmail}
          </p>
        )}
        {demoMode ? (
          <Link href="/" className="btn btn-ghost w-full justify-start px-0">
            Voltar ao site
          </Link>
        ) : (
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost w-full justify-start px-0">
              Sair
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

function NavGroup({
  title,
  links,
  pathname,
}: {
  title: string;
  links: { href: string; label: string; icon: typeof HomeIcon }[];
  pathname: string;
}) {
  return (
    <div>
      <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
        {title}
      </p>
      {links.map((link) => {
        const active = linkActive(pathname, link.href);
        const Icon = link.icon;
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
            <Icon active={active} />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}

function stroke(active?: boolean, gold?: boolean) {
  if (active) return gold ? "#c4a574" : "#4a1d6e";
  return "#6b7280";
}

function HomeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19h16" stroke={stroke(active)} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 16V10" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 16V7" stroke={stroke(active)} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M17 16v-4" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PronacIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" stroke={stroke(active)} strokeWidth="1.7" />
      <path d="M8 9h8M8 12h8M8 15h5" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CompareIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4h6l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M13 4v4h4" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 13h6M9 16h4" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function AuditIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 12h8M8 15h8M8 18h5" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke={stroke(active)} strokeWidth="1.7" />
      <path
        d="M3.5 18.5c.8-2.6 2.9-4 5.5-4s4.7 1.4 5.5 4"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.2" stroke={stroke(active, true)} strokeWidth="1.7" />
    </svg>
  );
}

function BuildingIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20V7l8-3 8 3v13" stroke={stroke(active)} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 20v-5h6v5" stroke={stroke(active, true)} strokeWidth="1.7" />
    </svg>
  );
}

function SyncIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12a8 8 0 0 1-13.5 5.8M4 12A8 8 0 0 1 17.5 6.2"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M17 3.5v4h4" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 20.5v-4H3" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MapIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9 4v14M15 6v14" stroke={stroke(active, true)} strokeWidth="1.7" />
    </svg>
  );
}
