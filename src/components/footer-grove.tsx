"use client";

import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";

// Repeated, stepped geometry keeps the forest crisp at every screen size.
const tree = "M0 0 12 20H7L23 44H16L33 70H5V90H-5V70H-33L-16 44H-23L-7 20H-12Z";
const layers = [
  { name: "far", count: 25, offset: -15, step: 62, base: 155, scale: .78 },
  { name: "near", count: 19, offset: 20, step: 83, base: 184, scale: 1.08 },
];

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
    observer.observe(element);
    reduced.addEventListener("change", preferenceChanged);
    return () => { stop(); observer.disconnect(); reduced.removeEventListener("change", preferenceChanged); };
  }, []);

  return <div ref={root} className="footer-grove">
    <svg className="footer-grove-art" viewBox="0 0 1440 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      {layers.map((layer, layerIndex) => <g key={layer.name} className={"grove-" + layer.name}>
        {Array.from({ length: layer.count }, (_, index) => {
          const scale = layer.scale * (1 + (index % 4) * .09);
          const x = layer.offset + index * layer.step;
          return <path key={index} d={tree} transform={`translate(${x} ${layer.base - 90 * scale - (index % 3) * 7}) scale(${scale})`} />;
        })}
        <rect x="0" y={layerIndex ? 177 : 151} width="1440" height="49" />
      </g>)}
    </svg>
    <a href="#main-content" className="footer-grove-return">Back to the top <ArrowUp size={16} aria-hidden="true" /></a>
  </div>;
}
