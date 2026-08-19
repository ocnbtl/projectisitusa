import type { NextConfig } from "next";

import researchDataDelivery from "./src/data/research/research-data-delivery.json";
import { validateResearchDataDelivery } from "./src/lib/research/research-data-delivery";

const isDevelopment = process.env.NODE_ENV !== "production";
const legacyResearchProjectionOrigin = process.env.VERCEL === "1"
  ? "https://raw.githubusercontent.com/ocnbtl/projectisitusa/main/public/generated/research"
  : null;

const validatedResearchDataDelivery = validateResearchDataDelivery(researchDataDelivery);

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://upload.wikimedia.org",
      "font-src 'self' data:",
      `connect-src 'self'${isDevelopment ? " ws: http: https:" : ""}`,
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "Referrer-Policy",
    value: "no-referrer",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    webpackMemoryOptimizations: true,
  },
  async rewrites() {
    const rewrites = [];
    if (legacyResearchProjectionOrigin) {
      rewrites.push({
        source: "/generated/research/:path*",
        destination: `${legacyResearchProjectionOrigin}/:path*`,
      });
    }
    if (validatedResearchDataDelivery.mode === "r2") {
      rewrites.push({
        source: "/research-data/:path*",
        destination: `${validatedResearchDataDelivery.r2.origin}/:path*`,
      });
    }
    return rewrites;
  },
  async headers() {
    if (isDevelopment) {
      return [];
    }

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
    ],
  },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
