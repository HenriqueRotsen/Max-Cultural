"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MaxOrigemLogo } from "@/components/MaxOrigemLogo";
import { signOut } from "@/lib/auth/actions";

const HUB_URL = (process.env.NEXT_PUBLIC_CULTURAL_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const ACCOUNT_URL = `${HUB_URL}/conta`;

const auditoriaLinks = [
  { href: "/inicio", label: "Início", icon: HomeIcon },
  { href: "/panorama", label: "Insights", icon: ChartIcon },
  { href: "/panorama/pronac", label: "Por PRONAC", icon: PronacIcon },
  { href: "/auditoria", label: "Relatório de Auditoria", icon: AuditIcon },
  { href: "/contas", label: "Proponentes", icon: BuildingIcon },
  { href: "/sync", label: "Atualizar", icon: SyncIcon },
  { href: "/observados", label: "Observados", icon: UsersIcon },
];

const fornecedoresLinks = [
  { href: "/fornecedores", label: "Dashboard", icon: HomeIcon },
  { href: "/fornecedores/favoritos", label: "Favoritos", icon: HeartIcon },
  { href: "/fornecedores/empresas", label: "Fornecedores", icon: UsersIcon },
  { href: "/fornecedores/mapa", label: "Mapa", icon: MapIcon },
  { href: "/fornecedores/servicos", label: "Serviços", icon: PackageIcon },
  { href: "/fornecedores/contratacoes", label: "Contratações", icon: HandshakeIcon },
  { href: "/fornecedores/analises", label: "Análises", icon: ChartIcon },
];

const moduleLinks = [
  { href: "/inicio", label: "Auditoria", icon: AuditIcon },
  { href: "/fornecedores", label: "Fornecedores", icon: UsersIcon },
];

export function origemNavModule(pathname: string): "home" | "auditoria" | "fornecedores" {
  if (pathname === "/painel") return "home";
  if (pathname === "/fornecedores" || pathname.startsWith("/fornecedores/")) {
    return "fornecedores";
  }
  return "auditoria";
}

function linkActive(pathname: string, href: string) {
  if (href === "/inicio") return pathname === "/inicio";
  if (href === "/fornecedores") {
    return pathname === "/fornecedores";
  }
  if (href === "/panorama") {
    return pathname === "/panorama" || /^\/panorama\/(?!pronac(?:\/|$))/.test(pathname);
  }
  if (href === "/contas") {
    return pathname === "/contas" || pathname.startsWith("/contas/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  userEmail,
  syncEnabled = true,
  demoMode = false,
}: {
  userEmail?: string;
  isAdmin?: boolean;
  syncEnabled?: boolean;
  demoMode?: boolean;
}) {
  const pathname = usePathname();
  const module = origemNavModule(pathname);
  const auditoria = auditoriaLinks.filter((l) => {
    if (!syncEnabled && l.href === "/sync") return false;
    if (demoMode && (l.href === "/sync" || l.href === "/contas")) return false;
    return true;
  });

  const nav =
    module === "home"
      ? { title: "Módulos", links: moduleLinks }
      : module === "fornecedores"
        ? { title: "Fornecedores", links: fornecedoresLinks }
        : { title: "Auditoria", links: auditoria };

  return (
    <aside className="shell-sidebar">
      <div className="flex items-center px-5 py-5">
        <Link href="/painel" className="block">
          <MaxOrigemLogo />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col space-y-4 px-3 pb-4">
        {module !== "home" ? (
          <Link
            href="/painel"
            className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)] hover:bg-[var(--gray-50)] hover:text-[var(--navy)]"
          >
            ← Módulos
          </Link>
        ) : null}
        <NavGroup title={nav.title} links={nav.links} pathname={pathname} />
        <a
          href={HUB_URL}
          className="mt-auto flex items-center rounded-xl px-3 py-2 transition hover:bg-[var(--gray-50)]"
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
      </nav>

      <div className="border-t border-[var(--border)] px-5 py-4 space-y-3">
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
          <>
            <a href={ACCOUNT_URL} className="btn btn-ghost w-full justify-start px-0">
              Minha conta
            </a>
            <form action={signOut}>
              <button type="submit" className="btn btn-ghost w-full justify-start px-0">
                Sair
              </button>
            </form>
          </>
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

function HeartIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20s-7-4.4-7-9.2C5 8 6.8 6.5 9 6.5c1.3 0 2.4.6 3 1.5.6-.9 1.7-1.5 3-1.5 2.2 0 4 1.5 4 4.3C19 15.6 12 20 12 20Z"
        stroke={stroke(active, true)}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PackageIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8 12 4l8 4-8 4-8-4Z" stroke={stroke(active)} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 8v8l8 4 8-4V8" stroke={stroke(active)} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 12v8" stroke={stroke(active, true)} strokeWidth="1.7" />
    </svg>
  );
}

function MapIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.2" stroke={stroke(active, true)} strokeWidth="1.7" />
    </svg>
  );
}

function HandshakeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 12 4.5 8.5 8 5l4 4 4-4 3.5 3.5L16 12l-4 4-4-4Z"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8 16.5 6 18.5M16 16.5 18 18.5" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
