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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          cspExtras: {
            scriptSrc: ["https://challenges.cloudflare.com"],
            connectSrc: [
              "https://viacep.com.br",
              "https://challenges.cloudflare.com",
            ],
            frameSrc: ["https://challenges.cloudflare.com"],
            // Capas (Supabase Storage / URL pública) + tiles Leaflet.
            imgSrc: [
              "https:",
              "https://*.supabase.co",
              "https://tile.openstreetmap.de",
            ],
          },
        }),
      },
    ];
  },
};

export default nextConfig;
