export type CspExtras = {
  scriptSrc?: string[];
  styleSrc?: string[];
  connectSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  frameSrc?: string[];
};

export type SecurityHeadersOptions = {
  cspExtras?: CspExtras;
  frameOptions?: "DENY" | "SAMEORIGIN";
};

function joinSources(base: string[], extras?: string[]) {
  if (!extras?.length) return base.join(" ");
  return [...base, ...extras].join(" ");
}

export function buildContentSecurityPolicy(options?: SecurityHeadersOptions): string {
  const extras = options?.cspExtras;
  return [
    "default-src 'self'",
    `img-src ${joinSources(["'self'", "data:", "blob:"], extras?.imgSrc)}`,
    `script-src ${joinSources(["'self'", "'unsafe-inline'", "'unsafe-eval'"], extras?.scriptSrc)}`,
    `style-src ${joinSources(["'self'", "'unsafe-inline'"], extras?.styleSrc)}`,
    `font-src ${joinSources(["'self'", "data:"], extras?.fontSrc)}`,
    `connect-src ${joinSources(["'self'", "https:"], extras?.connectSrc)}`,
    ...(extras?.frameSrc?.length
      ? [`frame-src ${joinSources(["'self'"], extras.frameSrc)}`]
      : []),
  ].join("; ");
}

export function buildSecurityHeaders(options?: SecurityHeadersOptions) {
  const isProd = process.env.NODE_ENV === "production";
  const security: Array<{ key: string; value: string }> = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "X-Frame-Options",
      value: options?.frameOptions ?? "DENY",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options),
    },
  ];

  if (isProd) {
    security.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return security;
}
