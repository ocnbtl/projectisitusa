"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
export function SiteHeader() {
  const pathname = usePathname();
  return <><a className="skip-link" href="#main-content">Skip to content</a><header className={`site-header ${pathname === "/" ? "is-map glass-panel" : ""}`}>
    <Link href="/" className="site-brand" aria-label="Isitusa home"><Image src="/isitusa-logo.png" alt="" width={36} height={36} priority /><span><strong>Isitusa</strong><small>Invasive species atlas</small></span></Link>
    <nav aria-label="Primary">{[["/", "Map"], ["/species", "Species"], ["/research", "Research"], ["/about", "About"]].map(([href, label]) => <Link key={href} href={href as "/"} aria-current={pathname === href || href === "/species" && pathname.startsWith("/species/") ? "page" : undefined} className={href === "/" ? "map-nav-link" : ""}>{label}</Link>)}<ThemeToggle /></nav>
  </header></>;
}
