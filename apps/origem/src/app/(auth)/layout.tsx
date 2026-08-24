import { origemHubLoginUrl } from "@/lib/auth/hub";
import { MaxOrigemLogo } from "@/components/MaxOrigemLogo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <a href={origemHubLoginUrl("/painel")} className="mb-6 inline-block">
          <MaxOrigemLogo />
        </a>
        {children}
      </div>
    </div>
  );
}
