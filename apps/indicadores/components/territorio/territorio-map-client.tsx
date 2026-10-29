"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "@/app/actions/territorio";

const TerritorioMap = dynamic(
  () =>
    import("@/components/territorio/territorio-map").then(
      (m) => m.TerritorioMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[22rem] items-center justify-center rounded-2xl border border-brand/10 bg-white/80 text-sm text-muted-foreground shadow-sm">
        Carregando mapa…
      </div>
    ),
  },
);

export function TerritorioMapClient({
  points,
  height,
}: {
  points: MapPoint[];
  height?: string;
}) {
  return <TerritorioMap points={points} height={height} />;
}
