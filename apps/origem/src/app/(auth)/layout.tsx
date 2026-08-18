import Link from "next/link";
import { MaxOrigemLogo } from "@/components/SalinkLogo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <Link href="/login" className="mb-6 inline-block">
          <MaxOrigemLogo />
        </Link>
        {children}
      </div>
    </div>
  );
}
