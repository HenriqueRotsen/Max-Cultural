"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { LatLngExpression } from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type CatalogMapPin = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  avgRating: number;
};

const icon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const brazilCenter: LatLngExpression = [-14.235, -51.9253];

function FitSuppliers({ suppliers }: { suppliers: CatalogMapPin[] }) {
  const map = useMap();

  useEffect(() => {
    if (suppliers.length === 0) {
      map.setView(brazilCenter, 4);
      return;
    }
    if (suppliers.length === 1) {
      map.setView([suppliers[0]!.latitude, suppliers[0]!.longitude], 12);
      return;
    }
    const bounds = L.latLngBounds(
      suppliers.map((s) => [s.latitude, s.longitude] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [map, suppliers]);

  return null;
}

export function CatalogBrazilMap({
  suppliers,
}: {
  suppliers: CatalogMapPin[];
}) {
  return (
    <div className="h-[70vh] overflow-hidden rounded-xl border border-[var(--border)] bg-white">
      <MapContainer
        center={brazilCenter}
        zoom={4}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitSuppliers suppliers={suppliers} />
        {suppliers.map((s) => (
          <Marker key={s.id} position={[s.latitude, s.longitude]} icon={icon}>
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-[var(--navy)]">{s.name}</p>
                {s.address ? (
                  <p className="text-xs text-[var(--gray-500)]">{s.address}</p>
                ) : null}
                <p className="text-xs text-[var(--gray-600)]">
                  {[s.city, s.state].filter(Boolean).join(" / ") || "—"}
                  {s.avgRating > 0 ? ` · ★ ${s.avgRating.toFixed(1)}` : ""}
                </p>
                <Link
                  href={`/fornecedores/empresas/${s.id}`}
                  className="text-xs font-medium text-[var(--navy)] underline underline-offset-2"
                >
                  Ver fornecedor
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
