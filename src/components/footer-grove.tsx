"use client";

import { useEffect, useRef } from "react";

/** Extend the ground below the artwork, preserving its complete coordinate system. */
export function FooterGrove() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, offset = 0, target = 0, lastInput = 0, lastTime = 0;
    let touching = false, touchY = 0, visible = false, leaving = false;
    const html = document.documentElement;
    const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const meta = existingMeta ?? document.createElement("meta");
    const previousColor = meta.content;
    if (!existingMeta) { meta.name = "theme-color"; document.head.appendChild(meta); }
    const atEnd = () => document.documentElement.scrollHeight - window.innerHeight - window.scrollY <= 4;
    function syncEdge() {
      // Safari's changing toolbars and fractional scrolling can leave a few pixels
      // between its visible edge and the document's mathematical scroll limit.
      const bottom = visible && element!.getBoundingClientRect().bottom <= window.innerHeight + 48;
      html.classList.toggle("footer-at-end", bottom);
      const css = getComputedStyle(element!);
      const edge = css.getPropertyValue(offset > 6 ? "--soil-base" : "--grove-ink").trim();
      html.style.setProperty("--footer-edge", edge);
      meta.content = bottom ? edge : css.getPropertyValue("--background").trim();
    }
    function paint(time: number) {
      const dt = Math.min(32, time - (lastTime || time - 16));
      lastTime = time;
      if (!touching && time - lastInput > 360) target = 0;
      const pinned = !leaving && atEnd();
      const previousOffset = offset;
      offset += (target - offset) * (1 - Math.exp(-dt / (target ? 90 : 170)));
      if (offset < .15 && target === 0) offset = 0;
      element!.style.setProperty("--root-reveal", offset.toFixed(2) + "px");
      syncEdge();
      // Preserve the bottom anchor only during a deliberate downward pull.
      // Upward scrolling is always free to leave the effect immediately.
      if (pinned) window.scrollBy({ top: offset - previousOffset, behavior: "instant" });
      if (offset > .15 || target > 0) frame = requestAnimationFrame(paint);
      else { frame = 0; lastTime = 0; element!.style.setProperty("--root-reveal", "0px"); }
    }
    function pull(delta: number) {
      if (reduced.matches || !visible || !atEnd() || delta <= 0) return;
      leaving = false;
      const limit = Math.min(190, (element!.offsetHeight - offset) * .38);
      target = Math.min(limit, target + Math.min(delta, 100) * .55);
      lastInput = performance.now();
      if (!frame) frame = requestAnimationFrame(paint);
    }
    function wheel(event: WheelEvent) {
      if (event.ctrlKey) return;
      if (event.deltaY < 0) { target = 0; leaving = true; return; }
      pull(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1));
    }
    function touchStart(event: TouchEvent) {
      touching = event.touches.length === 1;
      touchY = event.touches[0]?.clientY ?? 0;
    }
    function touchMove(event: TouchEvent) {
      if (!touching || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const delta = touchY - y;
      touchY = y;
      if (delta < 0) { target = 0; leaving = true; }
      else pull(delta * 1.6);
    }
    function touchEnd() { touching = false; target = 0; }
    function keyboard(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,button,a,[contenteditable]")) return;
      if (["PageDown", "End", "ArrowDown"].includes(event.key)) pull(110);
      if (["PageUp", "Home", "ArrowUp"].includes(event.key)) { target = 0; leaving = true; }
    }
    function preferenceChanged() {
      if (reduced.matches) {
        cancelAnimationFrame(frame); frame = 0; offset = target = 0;
        element!.style.setProperty("--root-reveal", "0px");
        syncEdge();
      }
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncEdge(); });
    observer.observe(element);
    let dark = html.classList.contains("dark");
    const themeObserver = new MutationObserver(() => {
      const next = html.classList.contains("dark");
      if (dark !== next) { dark = next; syncEdge(); }
    });
    themeObserver.observe(html, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("scroll", syncEdge, { passive: true });
    window.addEventListener("resize", syncEdge, { passive: true });
    window.visualViewport?.addEventListener("resize", syncEdge, { passive: true });
    window.visualViewport?.addEventListener("scroll", syncEdge, { passive: true });
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("touchend", touchEnd, { passive: true });
    window.addEventListener("touchcancel", touchEnd, { passive: true });
    window.addEventListener("keydown", keyboard);
    reduced.addEventListener("change", preferenceChanged);
    return () => {
      observer.disconnect(); themeObserver.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("scroll", syncEdge); window.removeEventListener("resize", syncEdge);
      window.visualViewport?.removeEventListener("resize", syncEdge); window.visualViewport?.removeEventListener("scroll", syncEdge);
      window.removeEventListener("wheel", wheel); window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove); window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchEnd); window.removeEventListener("keydown", keyboard);
      reduced.removeEventListener("change", preferenceChanged);
      html.classList.remove("footer-at-end");
      html.style.removeProperty("--footer-edge");
      if (existingMeta) meta.content = previousColor; else meta.remove();
    };
  }, []);

  return <div ref={root} className="footer-grove" aria-hidden="true">
    <div className="footer-grove-world">
      <div className="footer-grove-art" />
      <div className="footer-soil"><div className="footer-roots" /></div>
    </div>
  </div>;
}
