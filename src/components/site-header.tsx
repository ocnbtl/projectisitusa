"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Heart, Leaf, Map, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { href: "/", label: "Map", icon: Map }, { href: "/species", label: "Species", icon: Leaf },
  { href: "/research", label: "Research", icon: BookOpen }, { href: "/about", label: "About", icon: Users },
  { href: "/support", label: "Support", icon: Heart },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const node = nav.current;
    if (!node) return;
    const measure = () => {
      const active = node.querySelector<HTMLElement>('[aria-current="page"]');
      setPill(active ? { left: active.offsetLeft, width: active.offsetWidth } : { left: 0, width: 0 });
    };
    let active = true;
    measure();
    void document.fonts.ready.then(() => { if (active) measure(); });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => { active = false; observer.disconnect(); };
  }, [pathname]);
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header glass-panel">
      <Link href="/" className="site-brand" aria-label="IsItUSA home: Invasive Species In The United States of America">
        <Image src="/isitusa-logo.png" alt="" width={64} height={62} priority />
        <span className="brand-full-name">Invasive Species In The United States of America</span>
      </Link>
      <nav ref={nav} aria-label="Primary">
        <span aria-hidden="true" className="nav-active-pill" style={{ width: pill.width, transform: `translateX(${pill.left}px)`, opacity: pill.width ? 1 : 0 }} />
        {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} prefetch={true}
          aria-current={pathname === href || href === "/species" && pathname.startsWith("/species/") ? "page" : undefined}
          className={href === "/" ? "map-nav-link" : ""}
          onClick={event => {
            if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              setPill({ left: event.currentTarget.offsetLeft, width: event.currentTarget.offsetWidth });
            }
          }}><Icon size={16} aria-hidden="true" /><span>{label}</span></Link>)}
        <ThemeToggle />
      </nav>
    </header>
  </>;
}
