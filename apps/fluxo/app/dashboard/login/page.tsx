import { Suspense } from "react";
import { SiteShell } from "@/components/app-header";
import { LoginForm } from "@/components/admin/login-form";

export default function AdminLoginPage() {
  return (
    <SiteShell
      showHeader={false}
      width="3xl"
      mainClassName="flex min-h-screen items-center justify-center py-10"
    >
      <Suspense fallback={<div className="text-muted-foreground">Carregando…</div>}>
        <LoginForm />
      </Suspense>
    </SiteShell>
  );
}
