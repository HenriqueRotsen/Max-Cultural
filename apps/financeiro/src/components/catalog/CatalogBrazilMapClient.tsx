"use client";

import dynamic from "next/dynamic";
import type { CatalogMapPin } from "@/components/catalog/CatalogBrazilMap";

const CatalogBrazilMap = dynamic(
  () =>
    import("@/components/catalog/CatalogBrazilMap").then(
      (m) => m.CatalogBrazilMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[70vh] items-center justify-center rounded-xl border border-[var(--border)] bg-white text-sm text-[var(--gray-500)]">
        Carregando mapa…
      </div>
    ),
  },
);

export function CatalogBrazilMapClient({
  suppliers,
}: {
  suppliers: CatalogMapPin[];
}) {
  return <CatalogBrazilMap suppliers={suppliers} />;
}
