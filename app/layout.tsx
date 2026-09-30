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
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website", siteName: "isitusa", title: "isitusa | Invasive species, county by county",
    description: "Explore species records and follow the original sources for your county.",
    images: [{ url: "/brand/v2/isitusa-symbol.png", width: 2240, height: 2240, alt: "isitusa: bird, leaf, butterfly and mushroom" }],
  },
  twitter: {
    card: "summary", title: "isitusa | Invasive species, county by county",
    description: "Explore species records and follow the original sources for your county.",
    images: ["/brand/v2/isitusa-symbol.png"],
  },
  icons: {
    icon: [{ url: "/brand/v2/isitusa-symbol.png", type: "image/png", sizes: "2240x2240" }],
    shortcut: "/brand/v2/isitusa-symbol.png",
    apple: [{ url: "/brand/v2/isitusa-symbol.png", sizes: "2240x2240" }],
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
