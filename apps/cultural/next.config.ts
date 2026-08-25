import type { NextConfig } from "next";
import { buildSecurityHeaders } from "@max/security-headers";

const nextConfig: NextConfig = {
  transpilePackages: ["@max/auth", "@max/security-headers"],
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders() }];
  },
};

export default nextConfig;
