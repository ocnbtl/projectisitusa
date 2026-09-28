"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { href: "/", label: "Map" }, { href: "/species", label: "Species" },
  { href: "/research", label: "Research" }, { href: "/about", label: "About" },
  { href: "/support", label: "Support" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const node = nav.current;
    if (!node) return;
    const measure = () => {
      const active = node.querySelector<HTMLElement>('[aria-current="page"]');
      setPill(active ? { left: active.offsetLeft, width: active.offsetWidth } : { left: 0, width: 0 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [pathname]);
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className={`site-header ${pathname === "/" ? "is-map glass-panel" : ""}`}>
      <Link href="/" className="site-brand" aria-label="IsItUSA home: Invasive Species In The United States of America">
        <Image src="/isitusa-logo.png" alt="" width={64} height={62} priority />
        <span className="brand-full-name">Invasive Species<br />In The United States of America</span>
      </Link>
      <nav ref={nav} aria-label="Primary">
        <span aria-hidden="true" className="nav-active-pill" style={{ clipPath: "inset(0 calc(100% - " + pill.width + "px) 0 0 round 10px)", transform: `translateX(${pill.left}px)`, opacity: pill.width ? 1 : 0 }} />
        {navigation.map(({ href, label }) => <Link key={href} href={href}
          aria-current={pathname === href || href === "/species" && pathname.startsWith("/species/") ? "page" : undefined}
          className={href === "/" ? "map-nav-link" : ""}>{label}</Link>)}
        <ThemeToggle />
      </nav>
    </header>
  </>;
}
