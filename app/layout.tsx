import type { Metadata, Viewport } from "next";
import { SiteAnalytics } from "@/components/site-analytics";
import { SiteFooter } from "@/components/site-footer";

import "./globals.css";
import { Providers } from "@/components/providers";
import { RouteTransition } from "@/components/atlas/route-transition";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Invasive Species In The USA (ISITUSA)",
  description:
    "Get to know the invasive species near you. Explore local records, learn what to look for, and find practical ways to care for the places you love.",
  metadataBase: new URL("https://isitusa.com"),
  applicationName: "ISITUSA",
  manifest: "/brand/v8/site.webmanifest",
  openGraph: {
    type: "website", siteName: "ISITUSA", title: "Invasive Species In The USA (ISITUSA)",
    description: "Get to know the invasive species near you. Explore local records, learn what to look for, and find practical ways to care for the places you love.",
    images: [{ url: "/brand/v3/isitusa-symbol.png", width: 1200, height: 1200, alt: "ISITUSA: bird, leaf, butterfly and mushroom" }],
  },
  twitter: {
    card: "summary", title: "Invasive Species In The USA (ISITUSA)",
    description: "Get to know the invasive species near you. Explore local records, learn what to look for, and find practical ways to care for the places you love.",
    images: ["/brand/v3/isitusa-symbol.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "192x192" },
      { url: "/brand/v3/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/brand/v3/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/brand/v3/icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/brand/v3/icon-180.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><link rel="preload" href="/fonts/isitusa-canopy/isitusa-canopy.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head>
      <body className="font-[family-name:var(--font-body)] antialiased">
        <Providers>
          <div className="app-frame">
            <SiteHeader />
            <RouteTransition />
            {children}
            <SiteFooter />
          </div>
        </Providers>
        <SiteAnalytics />
      </body>
    </html>
  );
}
