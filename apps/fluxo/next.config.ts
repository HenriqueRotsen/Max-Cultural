import type { NextConfig } from "next";
import { buildSecurityHeaders } from "@max/security-headers";

const nextConfig: NextConfig = {
  transpilePackages: ["@max/auth", "@max/security-headers"],
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
          },
        }),
      },
    ];
  },
};

export default nextConfig;
