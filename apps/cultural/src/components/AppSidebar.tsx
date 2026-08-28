"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MaxCulturalLogo } from "@/components/BrandLogo";
import { logoutAction } from "@/lib/actions/auth";

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
  canOrigem,
  canFluxo,
  origemUrl,
  fluxoUrl,
}: {
  userEmail?: string;
  canProjetos?: boolean;
  canUsers?: boolean;
  canRoles?: boolean;
  canLogs?: boolean;
  canOrigem?: boolean;
  canFluxo?: boolean;
  origemUrl?: string;
  fluxoUrl?: string;
}) {
  const pathname = usePathname();
  const visible = hubLinks.filter((l) => {
    if (l.href === "/projetos") return true;
    if (l.href === "/usuarios") return canUsers;
    if (l.href === "/papeis") return canRoles;
    if (l.href === "/logs") return canLogs;
    return true;
  });

  const origemHref = `${(origemUrl || "http://localhost:3001").replace(/\/$/, "")}/painel`;
  const fluxoHref = `${(fluxoUrl || "http://localhost:3002").replace(/\/$/, "")}/dashboard`;
  const showProducts = Boolean(canOrigem || canFluxo);

  return (
    <aside className="shell-sidebar">
      <div className="flex items-center px-5 py-5">
        <MaxCulturalLogo />
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-4">
        <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        {visible.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
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
            {canOrigem ? (
              <a
                href={origemHref}
                className="flex items-center rounded-xl px-3 py-2.5 transition hover:opacity-95"
                style={{
                  background: "linear-gradient(165deg, #f5f3ff 0%, #fff 70%)",
                  boxShadow: "0 0 0 1px #c4b5fd55",
                }}
              >
                <img
                  src="/brand/max-origem.png"
                  alt="MAX Origem"
                  className="h-7 w-auto max-w-[9rem] object-contain object-left"
                />
              </a>
            ) : null}
            {canFluxo ? (
              <a
                href={fluxoHref}
                className="mt-1 flex items-center rounded-xl px-3 py-2.5 transition hover:opacity-95"
                style={{
                  background: "linear-gradient(165deg, #f0fdfa 0%, #fff 70%)",
                  boxShadow: "0 0 0 1px #5eead455",
                }}
              >
                <img
                  src="/brand/max-fluxo.png"
                  alt="MAX Fluxo"
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
        <form action={logoutAction}>
          <button type="submit" className="btn btn-ghost w-full justify-start px-0">
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
