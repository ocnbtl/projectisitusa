"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/admin") || pathname.startsWith("/auth/") || pathname === "/preferences") return null;
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div><Link href="/" className="footer-brand">IsItUSA</Link><p>For the places we care about.</p><small>An independent initiative based in the United States.</small></div>
        <nav aria-label="Get involved">
          <Link href="/join">Email updates <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <Link href="/report">Report a sighting <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <Link href="/support">Support the work <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </nav>
      </div>
      <div className="footer-details"><span>Sources, dates, and context. Always part of the picture.</span><nav aria-label="Site information"><Link href="/privacy">Privacy</Link><Link href="/terms">Support terms</Link><Link href="/preferences">Email preferences</Link></nav></div>
    </footer>
  );
}
