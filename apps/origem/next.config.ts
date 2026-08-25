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
  serverExternalPackages: ["playwright", "@prisma/client", "@prisma/adapter-pg", "pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          frameOptions: "SAMEORIGIN",
          cspExtras: {
            imgSrc: ["https://*.tile.openstreetmap.org"],
          },
        }),
      },
    ];
  },
};

export default nextConfig;
