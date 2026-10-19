"use client";
import Link from "next/link";
import { ANALYTICS_SETTINGS_EVENT } from "@/lib/ui/telemetry";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

const groups = [
  { title: "Explore", links: [{label:"County map",href:"/"},{label:"Species profiles",href:"/species"}] },
  { title: "Our research", links: [{label:"Research overview",href:"/research"},{label:"Our approach",href:"/approach"},{label:"Data sources",href:"/data-sources"},{label:"Credits",href:"/credits"}] },
  { title: "Get involved", links: [{label:"Report a sighting",href:"/report"},{label:"Email updates",href:"/join"},{label:"Ways to help for free",href:"/support/free"},{label:"Email preferences",href:"/preferences"}] },
  { title: "Contributions", links: [{label:"Support the mission",href:"/support"},{label:"Contribution terms",href:"/terms"},{label:"Request a refund",href:"/support/refund"}] },
  { title: "ISITUSA", links: [{label:"About us",href:"/about"},{label:"Brand kit",href:"/brand"},{label:"Privacy policy",href:"/privacy"}] },
] as const;

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/admin") || pathname.startsWith("/auth/") || pathname === "/preferences") return null;
  return (
    <footer className="site-footer footer-refined">
      <div className="footer-main">
        <div className="footer-introduction"><Link href="/" className="footer-brand" aria-label="ISITUSA home"><Image className="brand-art" src="/brand/v10/symbol-name.svg?v=1.005" alt="ISITUSA" width={90} height={116} unoptimized /></Link><p>Accessible invasive species research to protect the places you love</p></div>
        <div className="footer-navigation">
          {groups.map(group=><div key={group.title} className="footer-group">
            <nav className="footer-desktop-group" aria-label={group.title}><h2>{group.title}</h2>{group.links.map(link=><Link key={link.href} href={{pathname:link.href}}>{link.label}</Link>)}</nav>
            <details className="footer-mobile-group"><summary>{group.title}<ChevronDown size={16} aria-hidden="true"/></summary><nav aria-label={group.title}>{group.links.map(link=><Link key={link.href} href={{pathname:link.href}}>{link.label}</Link>)}</nav></details>
          </div>)}
        </div>
      </div>
      <div className="footer-details"><small>An independent initiative based in the United States.</small><div className="footer-utilities"><button type="button" onClick={() => window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT))}>Privacy choices</button><a href="#main-content">Back to top {"\u2191"}</a></div></div>
    </footer>
  );
}
