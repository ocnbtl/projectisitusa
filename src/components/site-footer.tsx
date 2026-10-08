"use client";
import Link from "next/link";
import { ANALYTICS_SETTINGS_EVENT } from "@/lib/ui/telemetry";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/admin") || pathname.startsWith("/auth/") || pathname === "/preferences") return null;
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-introduction"><Link href="/" className="footer-brand" aria-label="isitusa home"><Image className="brand-art" src="/brand/v3/isitusa-symbol-name.svg" alt="isitusa" width={90} height={120} unoptimized /></Link><p>Local knowledge.<br />A wider understanding.</p><small>Invasive species information, connected to the places you care about.</small></div>
        <nav aria-label="Explore"><h2>Explore</h2><Link href="/">Map</Link><Link href="/species">Species</Link><Link href="/research">Research</Link><Link href="/about">About isitusa</Link></nav>
        <nav aria-label="Get involved"><h2>Get involved</h2><Link href="/report">Document a sighting <ArrowUpRight size={14} aria-hidden="true" /></Link><Link href="/join">Email updates <ArrowUpRight size={14} aria-hidden="true" /></Link><Link href="/support">Support the work <ArrowUpRight size={14} aria-hidden="true" /></Link></nav>
        <nav aria-label="Site information"><h2>Good to know</h2><Link href="/brand">Brand kit</Link><Link href="/privacy">Privacy</Link><button type="button" className="text-left min-h-11" onClick={() => window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT))}>Privacy choices</button><Link href="/terms">Support terms</Link><Link href="/preferences">Email preferences</Link><Link href="/about#map-credits">Map artwork credits</Link></nav>
      </div>
      <div className="footer-details"><small>An independent initiative based in the United States.</small><a href="#main-content">Back to top ↑</a></div>
    </footer>
  );
}
