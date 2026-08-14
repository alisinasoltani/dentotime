import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const allowInsecureHttp = process.env.ALLOW_INSECURE_HTTP === "true";
const backendInternalUrl = (
  process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

const backendUrl = new URL(backendInternalUrl);
if (isProduction && !allowInsecureHttp && backendUrl.protocol !== "https:") {
  throw new Error("BACKEND_INTERNAL_URL must use HTTPS in production.");
}

const publicApiOrigin = process.env.NEXT_PUBLIC_API_URL
  ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
  : null;
if (
  isProduction &&
  publicApiOrigin &&
  !allowInsecureHttp && new URL(publicApiOrigin).protocol !== "https:"
) {
  throw new Error("NEXT_PUBLIC_API_URL must use HTTPS in production.");
}
const connectSources = ["'self'", ...(publicApiOrigin ? [publicApiOrigin] : [])];

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src ${connectSources.join(" ")}`,
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "object-src 'none'",
  // React's development runtime uses eval to reconstruct component stacks.
  // Keep this development-only; production remains free of unsafe-eval.
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  ...(isProduction && !allowInsecureHttp ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(isProduction && !allowInsecureHttp
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Django's APPEND_SLASH redirects API paths to a trailing slash. Let the
  // rewrite reach Django instead of having Next normalize the slash first,
  // which otherwise creates a redirect loop for browser Axios requests.
  skipTrailingSlashRedirect: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        // Next normalizes catch-all parameters without their final slash;
        // Django's URL patterns use APPEND_SLASH. Add it at the proxy
        // boundary so API calls never bounce between the two servers.
        destination: `${backendInternalUrl}/api/:path*/`,
      },
    ];
  },
};

export default nextConfig;
