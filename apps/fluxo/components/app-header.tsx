import type { ReactNode } from "react";
import { AppSidebarLayout } from "@/components/admin/app-sidebar-layout";
import { cn } from "@/lib/utils";
import { getSessionUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";

const WIDTH = {
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
  "7xl": "max-w-7xl",
} as const;

export type AppHeaderWidth = keyof typeof WIDTH;

type SiteShellProps = {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
  /** false em login/recuperação/onboarding */
  showHeader?: boolean;
  width?: AppHeaderWidth;
  mainClassName?: string;
};

export async function SiteShell({
  children,
  title,
  actions,
  showHeader = true,
  width = "5xl",
  mainClassName,
}: SiteShellProps) {
  if (showHeader) {
    const user = await getSessionUser();
    if (user) {
      const permissions = await getEffectivePermissions(user.id);
      return (
        <AppSidebarLayout
          userEmail={user.email}
          permissions={[...permissions]}
          title={title}
          actions={actions}
          contentClassName={cn("mx-auto w-full", WIDTH[width])}
          mainClassName={mainClassName}
        >
          {children}
        </AppSidebarLayout>
      );
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,var(--brand-mist)_0%,#faf8f5_42%,#f3efe8_100%)]">
      <main
        className={cn(
          "mx-auto px-4 py-6 sm:px-6",
          WIDTH[width],
          mainClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}
