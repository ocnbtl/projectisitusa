"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoLoader } from "./logo-loader";

/** Feedback for real navigation waits; never delay a page just to play animation. */
export function RouteTransition() {
  const pathname = usePathname();
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setPendingFrom(null);
    function start() {
      clearTimeout(timeout);
      clearTimeout(expiry);
      timeout = setTimeout(() => setPendingFrom(pathname), 120);
      expiry = setTimeout(() => setPendingFrom(null), 15000);
    }
    function follow(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname !== pathname) start();
    }
    function cancel(event: KeyboardEvent) { if (event.key === "Escape") { clearTimeout(timeout); setPendingFrom(null); } }
    document.addEventListener("click", follow, true);
    document.addEventListener("keydown", cancel);
    return () => { clearTimeout(timeout); clearTimeout(expiry); document.removeEventListener("click", follow, true); document.removeEventListener("keydown", cancel); };
  }, [pathname]);
  return pendingFrom === pathname ? <LogoLoader overlay /> : null;
}
