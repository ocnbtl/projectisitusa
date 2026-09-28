"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { href: "/", label: "Map" },
  { href: "/species", label: "Species" },
  { href: "/research", label: "Research" },
  { href: "/about", label: "About" },
  { href: "/support", label: "Support" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className={`site-header ${pathname === "/" ? "is-map glass-panel" : ""}`}>
        <Link href="/" className="site-brand" aria-label="IsItUSA home: Invasive Species In The United States of America">
          <Image src="/isitusa-logo.png" alt="" width={36} height={36} priority />
          <span><strong>IsItUSA</strong><small><b>I</b>nvasive <b>S</b>pecies <b>I</b>n <b>T</b>he <b>U</b>nited <b>S</b>tates of <b>A</b>merica</small></span>
        </Link>
        <nav aria-label="Primary">
          {navigation.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={pathname === href || href === "/species" && pathname.startsWith("/species/") ? "page" : undefined} className={href === "/" ? "map-nav-link" : ""}>{label}</Link>
          ))}
          <ThemeToggle />
        </nav>
      </header>
    </>
  );
}
