import { financeiroHubLoginUrl } from "@/lib/auth/hub";
import { MaxFinanceiroLogo } from "@/components/MaxFinanceiroLogo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <a href={financeiroHubLoginUrl("/painel")} className="mb-6 inline-block">
          <MaxFinanceiroLogo />
        </a>
        {children}
      </div>
    </div>
  );
}
