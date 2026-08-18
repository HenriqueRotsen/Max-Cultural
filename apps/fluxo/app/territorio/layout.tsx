import { Suspense } from "react";
import { SiteShell } from "@/components/app-header";
import { PageLoading } from "@/components/page-loading";

export default function TerritorioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteShell width="5xl" mainClassName="pb-20">
      <Suspense fallback={<PageLoading label="Carregando território…" />}>
        {children}
      </Suspense>
    </SiteShell>
  );
}
