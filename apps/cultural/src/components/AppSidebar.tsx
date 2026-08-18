"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MaxCulturalLogo } from "@/components/BrandLogo";
import { logoutAction } from "@/lib/actions/auth";

const links = [
  { href: "/", label: "Início" },
  { href: "/usuarios", label: "Usuários" },
  { href: "/papeis", label: "Papéis" },
  { href: "/logs", label: "Logs" },
];

export function AppSidebar({
  userEmail,
  canUsers,
  canRoles,
  canLogs,
}: {
  userEmail?: string;
  canUsers?: boolean;
  canRoles?: boolean;
  canLogs?: boolean;
}) {
  const pathname = usePathname();
  const visible = links.filter((l) => {
    if (l.href === "/usuarios") return canUsers;
    if (l.href === "/papeis") return canRoles;
    if (l.href === "/logs") return canLogs;
    return true;
  });

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
          const active = pathname === link.href;
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
      </nav>
      <div className="mt-auto border-t border-[var(--border)] px-5 py-4 space-y-3">
        {userEmail ? (
          <p className="truncate text-xs text-[var(--gray-500)]" title={userEmail}>
            {userEmail}
          </p>
        ) : null}
        <form action={logoutAction}>
          <button type="submit" className="btn btn-ghost w-full justify-start px-0">
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
