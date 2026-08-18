import Link from "next/link";
import { MaxOrigemLogo } from "@/components/SalinkLogo";

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <div className="marketing-header-inner">
        <Link href="/login" className="block">
          <MaxOrigemLogo />
        </Link>
        <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link href="/contato" className="marketing-nav-link">
            Contato
          </Link>
          <Link href="/login" className="btn">
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-inner">
        <MaxOrigemLogo className="opacity-90" />
        <p className="mt-3 max-w-md text-sm text-[var(--gray-500)]">
          MAX Origem — auditoria SALIC e banco de fornecedores.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-[var(--gray-500)]">
          <Link href="/contato" className="hover:text-[var(--navy)]">
            Contato
          </Link>
          <Link href="/login" className="hover:text-[var(--navy)]">
            Entrar
          </Link>
        </div>
        <p className="mt-6 text-xs text-[var(--gray-400)]">
          © {new Date().getFullYear()} MAX Cultural
        </p>
      </div>
    </footer>
  );
}
