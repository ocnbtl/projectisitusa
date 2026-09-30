"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/admin") || pathname.startsWith("/auth/") || pathname === "/preferences") return null;
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div><Link href="/" className="footer-brand" aria-label="isitusa home"><Image src="/brand/v2/isitusa-symbol-name.png" alt="isitusa" width={100} height={122} unoptimized /></Link><p>Get to know the species around you.</p><small>An independent initiative based in the United States.</small></div>
        <nav aria-label="Get involved">
          <Link href="/join">Email updates <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <Link href="/report">Report a sighting <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <Link href="/support">Support the work <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </nav>
      </div>
      <div className="footer-details"><span>Explore the records. Check the sources.</span><nav aria-label="Site information"><Link href="/brand">Brand kit</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Support terms</Link><Link href="/preferences">Email preferences</Link></nav></div>
    </footer>
  );
}
