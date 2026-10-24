"use client";

import { useEffect, useRef } from "react";

/** Native scrolling reveals the soil without changing the document under the user. */
export function FooterGrove() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    const world = element?.querySelector<HTMLElement>(".footer-grove-world");
    if (!element || !world) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const html = document.documentElement;
    const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const meta = existingMeta ?? document.createElement("meta");
    const previousColor = meta.content;
    if (!existingMeta) { meta.name = "theme-color"; document.head.appendChild(meta); }
    let edgeFrame = 0, returnFrame = 0, idleTimer = 0;
    let pressing = false, returning = false, returnedThisVisit = false;
    let expectedY = window.scrollY;

    function geometry() {
      const rect = world!.getBoundingClientRect();
      const ground = rect.bottom + window.scrollY;
      return { baseline: Math.max(0, ground - window.innerHeight), depth: Math.max(0, window.innerHeight - rect.bottom) };
    }
    function syncEdge() {
      edgeFrame = 0;
      const rect = element!.getBoundingClientRect();
      const bottom = rect.top < window.innerHeight && world!.getBoundingClientRect().bottom <= window.innerHeight + 48;
      html.classList.toggle("footer-at-end", bottom);
      const css = getComputedStyle(element!);
      const channels = (name: string) => {
        const hex = css.getPropertyValue(name).trim().replace("#", "");
        return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
      };
      const forest = channels("--grove-ink"), soil = channels("--soil-base");
      const depth = Math.min(1, geometry().depth / parseFloat(css.getPropertyValue("--soil-depth")));
      const edge = `rgb(${forest.map((value, index) => Math.round(value + (soil[index] - value) * depth)).join(", ")})`;
      html.style.setProperty("--footer-edge", edge);
      meta.content = bottom ? edge : css.getPropertyValue("--background").trim();
    }
    function queueEdge() { if (!edgeFrame) edgeFrame = requestAnimationFrame(syncEdge); }
    function cancelReturn() {
      window.clearTimeout(idleTimer); idleTimer = 0;
      cancelAnimationFrame(returnFrame); returnFrame = 0; returning = false;
    }
    function returnToGround() {
      idleTimer = 0;
      const { baseline, depth } = geometry();
      if (pressing || reduced.matches || returnedThisVisit || depth <= 1) return;
      const startY = window.scrollY;
      const started = performance.now();
      // One return per visit prevents middle-button autoscroll from bouncing forever.
      returnedThisVisit = true; returning = true;
      function settle(time: number) {
        const progress = Math.min(1, (time - started) / 850);
        // Zero velocity and acceleration at both ends, including the idle handoff.
        const ease = progress ** 3 * (10 + progress * (-15 + progress * 6));
        expectedY = startY + (baseline - startY) * ease;
        window.scrollTo({ top: expectedY, behavior: "instant" });
        queueEdge();
        if (progress < 1) returnFrame = requestAnimationFrame(settle);
        else { returnFrame = 0; returning = false; }
      }
      returnFrame = requestAnimationFrame(settle);
    }
    function scheduleReturn() {
      window.clearTimeout(idleTimer);
      if (!pressing && !reduced.matches && !returnedThisVisit && geometry().depth > 1) {
        idleTimer = window.setTimeout(returnToGround, 1100);
      }
    }
    function scrolling() {
      queueEdge();
      const { baseline } = geometry();
      if (window.scrollY < baseline - 160) returnedThisVisit = false;
      if (returning) {
        // Ignore our own return events; scrollbar/autoscroll input always takes over.
        if (Math.abs(window.scrollY - expectedY) < 2) return;
        cancelReturn();
      }
      scheduleReturn();
    }
    function wheel() { cancelReturn(); scheduleReturn(); }
    function pointerStart() { pressing = true; cancelReturn(); }
    function pointerEnd() { pressing = false; scheduleReturn(); }
    function keyboard(event: KeyboardEvent) {
      if (["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
        cancelReturn(); scheduleReturn();
      }
    }
    function resized() { cancelReturn(); queueEdge(); scheduleReturn(); }
    const observer = new IntersectionObserver(queueEdge);
    observer.observe(element);
    let dark = html.classList.contains("dark");
    const themeObserver = new MutationObserver(() => {
      const next = html.classList.contains("dark");
      if (dark !== next) { dark = next; queueEdge(); }
    });
    themeObserver.observe(html, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("scroll", scrolling, { passive: true });
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("pointerdown", pointerStart, { passive: true });
    window.addEventListener("pointerup", pointerEnd, { passive: true });
    window.addEventListener("pointercancel", pointerEnd, { passive: true });
    window.addEventListener("keydown", keyboard);
    window.addEventListener("resize", resized, { passive: true });
    window.visualViewport?.addEventListener("resize", resized, { passive: true });
    window.visualViewport?.addEventListener("scroll", queueEdge, { passive: true });
    reduced.addEventListener("change", resized);
    queueEdge();
    return () => {
      observer.disconnect(); themeObserver.disconnect(); cancelReturn(); cancelAnimationFrame(edgeFrame);
      window.removeEventListener("scroll", scrolling); window.removeEventListener("wheel", wheel);
      window.removeEventListener("pointerdown", pointerStart); window.removeEventListener("pointerup", pointerEnd);
      window.removeEventListener("pointercancel", pointerEnd); window.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", resized);
      window.visualViewport?.removeEventListener("resize", resized); window.visualViewport?.removeEventListener("scroll", queueEdge);
      reduced.removeEventListener("change", resized);
      html.classList.remove("footer-at-end"); html.style.removeProperty("--footer-edge");
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
