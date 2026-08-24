import { MaxOrigemLogo } from "@/components/MaxOrigemLogo";

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <div className="marketing-header-inner">
        <a href="/painel" className="block">
          <MaxOrigemLogo />
        </a>
        <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
          <a href="/contato" className="marketing-nav-link">
            Contato
          </a>
          <a href="/painel" className="btn">
            Entrar
          </a>
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
          <a href="/contato" className="hover:text-[var(--navy)]">
            Contato
          </a>
          <a href="/painel" className="hover:text-[var(--navy)]">
            Entrar
          </a>
        </div>
        <p className="mt-6 text-xs text-[var(--gray-400)]">
          © {new Date().getFullYear()} MAX Cultural
        </p>
      </div>
    </footer>
  );
}
