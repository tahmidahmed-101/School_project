const isDev = process.env.NODE_ENV !== "production";

// LaunchCart public storefront API. The only place the default lives: it is inlined below as
// NEXT_PUBLIC_API_URL so server code reads it, and the browser reaches it through the /api/public proxy.
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1/public").replace(/\/+$/, "");
const API_ORIGIN = new URL(API_URL).origin;
// Customer (account) API, a sibling of the public one. It is proxied under its backend path because the HttpOnly
// refresh cookie is scoped to Path=/api/v1/customer/auth/ and the browser only sends it to that same path.
const CUSTOMER_API_URL = `${API_ORIGIN}/api/v1/customer`;

// Next injects inline bootstrap scripts, so script-src keeps 'unsafe-inline'; dev also needs eval and the HMR socket.
// The analytics/ad-pixel origins are always allowed (harmless if unused) so the env-gated scripts in layout.tsx
// never get silently blocked once someone sets the tracking IDs.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://connect.facebook.net https://analytics.tiktok.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} https://www.google-analytics.com https://analytics.google.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://connect.facebook.net https://www.facebook.com https://analytics.tiktok.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_API_URL: API_URL },
  images: {
    // Media URLs are absolute on the API origin (catalog/data/adapters.ts), which is loopback in local development.
    dangerouslyAllowLocalIP: ["127.0.0.1", "localhost"].includes(new URL(API_ORIGIN).hostname),
    remotePatterns: [
      // Product photos uploaded through the LaunchCart admin are served from the backend's /media/.
      {
        protocol: API_ORIGIN.startsWith("https") ? "https" : "http",
        hostname: new URL(API_ORIGIN).hostname,
        ...(new URL(API_ORIGIN).port && { port: new URL(API_ORIGIN).port }),
      },
      // Placeholder photos the backend's demo seeder (apps/common/services/demo_seed) assigns to every seeded product.
      { protocol: "https", hostname: "picsum.photos", pathname: "/seed/**" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // A build renders every product page against the live API; retry a page that hit a transient network error
    // instead of failing the whole build.
    staticGenerationRetryCount: 2,
  },
  // The browser only ever talks to this origin (CSP connect-src 'self', no CORS): /api/public/* and
  // /api/v1/customer/* are proxied to the LaunchCart API and /media/* to its uploaded files. Django routes end in "/", so it is re-added here.
  async rewrites() {
    return [
      { source: "/api/public/:path*", destination: `${API_URL}/:path*/` },
      { source: "/api/v1/customer/:path*", destination: `${CUSTOMER_API_URL}/:path*/` },
      { source: "/media/:path*", destination: `${API_ORIGIN}/media/:path*` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
