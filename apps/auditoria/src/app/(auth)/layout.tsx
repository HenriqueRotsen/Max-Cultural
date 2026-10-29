import { financeiroHubLoginUrl } from "@/lib/auth/hub";
import { MaxAuditoriaLogo } from "@/components/MaxAuditoriaLogo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <a href={financeiroHubLoginUrl("/inicio")} className="mb-6 inline-block">
          <MaxAuditoriaLogo />
        </a>
        {children}
      </div>
    </div>
  );
}
