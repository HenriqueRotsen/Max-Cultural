"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { MapPoint } from "@/app/actions/territorio";
import "leaflet/dist/leaflet.css";

const markerIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 10);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  }, [map, points]);
  return null;
}

type TerritorioMapProps = {
  points: MapPoint[];
  className?: string;
  height?: string;
};

export function TerritorioMap({
  points,
  className,
  height = "22rem",
}: TerritorioMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (points.length === 0) return [-14.2, -51.9];
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    return [lat, lng];
  }, [points]);

  if (points.length === 0) {
    return (
      <div
        className={
          className ??
          "flex items-center justify-center rounded-2xl border border-brand/10 bg-white/80 text-sm text-muted-foreground shadow-sm"
        }
        style={{ height }}
      >
        Sem coordenadas ainda — as cidades serão geocodificadas sob demanda.
      </div>
    );
  }

  return (
    <div
      className={
        className ??
        "overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-sm"
      }
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={5}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((p) => (
          <Marker
            key={p.href}
            position={[p.lat, p.lng]}
            icon={markerIcon}
          >
            <Popup>
              <div className="min-w-[10rem] space-y-1 text-sm">
                <div className="font-semibold text-brand-deep">
                  {p.cidade} / {p.estado}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.inscritos} inscritos · {p.selecionados} sel. ·{" "}
                  {p.participantes} part.
                </div>
                <Link
                  href={p.href}
                  className="text-xs font-medium text-brand underline-offset-2 hover:underline"
                >
                  Ver análise
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
