import type { Metadata, Viewport } from "next";
import { SiteAnalytics } from "@/components/site-analytics";
import { SiteFooter } from "@/components/site-footer";

import "./globals.css";
import { Providers } from "@/components/providers";
import { RouteTransition } from "@/components/atlas/route-transition";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Invasive Species in the USA",
  description:
    "Explore invasive species across the United States with a county map, ZIP search, and practical species profiles.",
  metadataBase: new URL("https://isitusa.com"),
  applicationName: "isitusa",
  manifest: "/brand/v3/site.webmanifest",
  openGraph: {
    type: "website", siteName: "isitusa", title: "isitusa | Invasive species, county by county",
    description: "Explore species records and follow the original sources for your county.",
    images: [{ url: "/brand/v3/isitusa-symbol.png", width: 1200, height: 1200, alt: "isitusa: bird, leaf, butterfly and mushroom" }],
  },
  twitter: {
    card: "summary", title: "isitusa | Invasive species, county by county",
    description: "Explore species records and follow the original sources for your county.",
    images: ["/brand/v3/isitusa-symbol.png"],
  },
  icons: {
    icon: [
      { url: "/brand/v3/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/brand/v3/icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/brand/v3/favicon.svg",
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
