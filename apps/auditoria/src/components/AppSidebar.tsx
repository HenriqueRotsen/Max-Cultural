"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileBottomNav, MobileTableCards, useMobileMenu } from "@max/mobile-nav";
import { MaxAuditoriaLogo } from "@/components/MaxAuditoriaLogo";

const HUB_URL = (process.env.NEXT_PUBLIC_CULTURAL_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

/** Menu em grupos: acompanhar → analisar → cadastrar → ferramentas. */
const auditoriaLinks = [
  { href: "/inicio", label: "Início", icon: HomeIcon, group: "Acompanhar" },
  { href: "/alertas", label: "Alertas", icon: AlertIcon, group: "Acompanhar" },
  { href: "/panorama/pronac", label: "Por PRONAC", icon: PronacIcon, group: "Analisar" },
  { href: "/panorama", label: "Panorama geral", icon: ChartIcon, group: "Analisar" },
  { href: "/fornecedores-pagos", label: "Fornecedores pagos", icon: PackageIcon, group: "Analisar" },
  { href: "/observados", label: "Observados", icon: UsersIcon, group: "Cadastros" },
  { href: "/contas/mapa", label: "Mapa societário", icon: MapIcon, group: "Cadastros" },
  { href: "/auditoria", label: "Relatório de Auditoria", icon: AuditIcon, group: "Ferramentas" },
  { href: "/atualizacao", label: "Atualizar SALIC", icon: SyncIcon, group: "Ferramentas" },
];
const NAV_GROUPS = ["Acompanhar", "Analisar", "Cadastros", "Ferramentas"];

function linkActive(pathname: string, href: string) {
  if (href === "/inicio") return pathname === "/inicio" || pathname === "/";
  if (href === "/panorama") {
    return pathname === "/panorama" || /^\/panorama\/(?!pronac(?:\/|$))/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  userEmail,
  syncEnabled = true,
  newAlerts = 0,
}: {
  userEmail?: string;
  isAdmin?: boolean;
  syncEnabled?: boolean;
  /** Alertas ainda não vistos (contador no menu). */
  newAlerts?: number;
}) {
  const pathname = usePathname();
  const links = auditoriaLinks
    .filter((l) => syncEnabled || l.href !== "/atualizacao")
    .map((l) => (l.href === "/alertas" ? { ...l, badge: newAlerts } : l));

  const menu = useMobileMenu(pathname);
  // Rodapé no celular: o essencial; o resto fica no menu.
  const mobileHrefs = ["/inicio", "/alertas", "/panorama", "/panorama/pronac"];
  const mobileItems = links
    .filter((l) => mobileHrefs.includes(l.href))
    .map((link) => {
      const Icon = link.icon;
      const active = linkActive(pathname, link.href);
      return {
        href: link.href,
        label: link.label,
        icon: <Icon active={active} />,
        active,
        badge: "badge" in link ? link.badge : undefined,
      };
    });

  return (
    <>
    <aside className="shell-sidebar" data-mx-drawer data-open={menu.open ? "true" : undefined}>
      <div className="flex items-center px-5 py-5">
        <Link href="/inicio" className="block">
          <MaxAuditoriaLogo />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col space-y-5 px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <NavGroup
            key={group}
            title={group}
            links={links.filter((l) => l.group === group)}
            pathname={pathname}
          />
        ))}
        <div className="mt-auto space-y-4">
          <div className="border-t border-[var(--border)] pt-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
              Hub
            </p>
            <a
              href={HUB_URL}
              className="flex items-center rounded-xl px-3 py-2.5 transition hover:opacity-95"
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
                className="h-7 w-auto max-w-[9rem] object-contain object-left"
              />
            </a>
          </div>

          <div className="border-t border-[var(--border)] pt-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
              Conta
            </p>
            <a
              href="/sair"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--gray-600)] transition hover:bg-[var(--gray-50)] hover:text-[var(--navy)]"
            >
              <LogoutIcon />
              <span className="min-w-0">
                <span className="block truncate">Sair</span>
                {userEmail ? (
                  <span
                    className="block truncate text-xs font-normal text-[var(--gray-400)]"
                    title={userEmail}
                  >
                    {userEmail}
                  </span>
                ) : null}
              </span>
            </a>
          </div>
        </div>
      </nav>
    </aside>
    <MobileBottomNav
      items={mobileItems}
      menuOpen={menu.open}
      onMenuToggle={menu.toggle}
    />
    <MobileTableCards />
    </>
  );
}

function NavGroup({
  title,
  links,
  pathname,
}: {
  title: string;
  links: { href: string; label: string; icon: typeof HomeIcon; badge?: number }[];
  pathname: string;
}) {
  if (!links.length) return null;
  return (
    <div>
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
        {title}
      </p>
      {links.map((link) => {
        const active = linkActive(pathname, link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] font-medium transition ${
              active
                ? "bg-[var(--navy-soft)] text-[var(--navy)]"
                : "text-[var(--gray-600)] hover:bg-[var(--gray-50)] hover:text-[var(--navy)]"
            }`}
          >
            <Icon active={active} />
            <span className="flex-1">{link.label}</span>
            {link.badge ? (
              <span className="rounded-full bg-[#dc2626] px-2 py-0.5 text-[11px] font-semibold text-white">
                {link.badge > 99 ? "99+" : link.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function stroke(active?: boolean, gold?: boolean) {
  if (active) return gold ? "#1d6fe0" : "#0b2a6b";
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

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 7V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-2"
        stroke={stroke()}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 12H4m0 0 3-3m-3 3 3 3"
        stroke={stroke(undefined, true)}
        strokeWidth="1.7"
        strokeLinecap="round"
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

function SyncIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4a5 5 0 0 0-5 5v3.2L5.4 15a1 1 0 0 0 .9 1.5h11.4a1 1 0 0 0 .9-1.5L17 12.2V9a5 5 0 0 0-5-5Z"
        stroke={stroke(active)}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" stroke={stroke(active, true)} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
