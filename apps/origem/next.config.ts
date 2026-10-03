import type { NextConfig } from "next";
import { buildSecurityHeaders } from "@max/security-headers";

/** Extra hosts allowed to load /_next/* in `next dev` (e.g. ngrok). */
const allowedDevOrigins = [
  "*.ngrok-free.dev",
  "*.ngrok-free.app",
  "*.ngrok.io",
  ...(process.env.ALLOWED_DEV_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

const nextConfig: NextConfig = {
  transpilePackages: ["@max/auth", "@max/security-headers"],
  allowedDevOrigins,
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pdf-parse",
  ],
  // Arquivos não-JS que o tracing não detecta: binário do Chromium serverless
  // e metadados do playwright-core (browsers.json etc.).
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/@sparticuz/chromium/bin/**",
      "../../node_modules/playwright-core/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          frameOptions: "SAMEORIGIN",
          cspExtras: {
            // Tiles do mapa (Leaflet). OSM.org bloqueia hotlink; usamos Carto.
            imgSrc: [
              "https://*.basemaps.cartocdn.com",
              "https://a.basemaps.cartocdn.com",
              "https://b.basemaps.cartocdn.com",
              "https://c.basemaps.cartocdn.com",
              "https://d.basemaps.cartocdn.com",
            ],
          },
        }),
      },
    ];
  },
};

export default nextConfig;
