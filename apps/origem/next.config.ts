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
    "unpdf",
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
            // Tiles Leaflet (OSM.de — gratuito, sem API key).
            imgSrc: ["https://tile.openstreetmap.de"],
          },
        }),
      },
    ];
  },
};

export default nextConfig;
