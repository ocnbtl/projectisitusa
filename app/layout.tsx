import type { Metadata, Viewport } from "next";
import { SiteAnalytics } from "@/components/site-analytics";
import { SiteFooter } from "@/components/site-footer";

import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Invasive Species in the USA",
  description:
    "Explore invasive species across the United States with a county map, ZIP search, and practical species profiles.",
  icons: {
    icon: [{ url: "/isitusa-logo.png", type: "image/png", sizes: "512x496" }],
    shortcut: "/isitusa-logo.png",
    apple: "/isitusa-logo.png",
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
            {children}
            <SiteFooter />
          </div>
        </Providers>
        <SiteAnalytics />
      </body>
    </html>
  );
}
