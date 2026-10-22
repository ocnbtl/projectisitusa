"use client";

import { useEffect, useRef } from "react";

export function FooterGrove() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let listening = false;
    function paint() {
      frame = 0;
      if (!element) return;
      const visible = Math.min(1, Math.max(0, (window.innerHeight - element.getBoundingClientRect().top) / element.offsetHeight));
      element.style.setProperty("--grove-progress", String(visible));
    }
    function requestPaint() { if (!frame) frame = window.requestAnimationFrame(paint); }
    function stop() {
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("resize", requestPaint);
      window.cancelAnimationFrame(frame);
      frame = 0;
      listening = false;
    }
    const observer = new IntersectionObserver(([entry]) => {
      stop();
      if (entry.isIntersecting && !reduced.matches) {
        window.addEventListener("scroll", requestPaint, { passive: true });
        window.addEventListener("resize", requestPaint);
        listening = true;
        requestPaint();
      }
    });
    function preferenceChanged() {
      if (reduced.matches) { stop(); element?.style.removeProperty("--grove-progress"); }
      else if (!listening) { observer.unobserve(element!); observer.observe(element!); }
    }
    if (!reduced.matches) paint();
    observer.observe(element);
    reduced.addEventListener("change", preferenceChanged);
    return () => { stop(); observer.disconnect(); reduced.removeEventListener("change", preferenceChanged); };
  }, []);

  return <div ref={root} className="footer-grove">
    <div className="footer-grove-art" aria-hidden="true" />
  </div>;
}
