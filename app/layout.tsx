import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Invasive Species in the USA",
  description:
    "Explore invasive species across the United States with a dark-first county map, ZIP search, and practical species profiles.",
  icons: {
    icon: [{ url: "/isitusa-logo.png", type: "image/png", sizes: "512x496" }],
    shortcut: "/isitusa-logo.png",
    apple: "/isitusa-logo.png",
  },
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
          <div className="min-h-screen pb-10">
            <SiteHeader />
            {children}
          </div>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
