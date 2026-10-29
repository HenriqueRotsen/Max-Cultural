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
  transpilePackages: ["@max/auth", "@max/mobile-nav", "@max/security-headers"],
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
  // Telas da Auditoria (antigo Salink) foram para o app próprio: links antigos seguem para lá.
  async redirects() {
    const auditoria = (process.env.NEXT_PUBLIC_AUDITORIA_URL || "").replace(/\/$/, "");
    if (!auditoria) return [];
    return [
      "/inicio",
      "/panorama/:path*",
      "/auditoria",
      "/fornecedores-pagos",
      "/observados",
      "/comparar",
      "/sync",
      "/contas/mapa/:path*",
    ].map((source) => ({
      source,
      destination: `${auditoria}${source}`,
      permanent: false,
    }));
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
