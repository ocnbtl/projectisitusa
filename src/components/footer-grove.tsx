"use client";

import { useEffect, useRef } from "react";

/** A brief elastic reveal at the forest edge; never extra scrollable page content. */
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
    let edgeFrame = 0, motionFrame = 0;
    let reveal = 0, velocity = 0, peak = 0, started = 0, lastFrame = 0;
    let previousY = window.scrollY, previousWidth = window.innerWidth, touchY: number | null = null;
    const atEnd = () => html.scrollHeight - window.innerHeight - window.scrollY <= 3;
    const limit = () => Math.min(140, world!.getBoundingClientRect().height * .3);
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
      const depth = Math.min(1, reveal / parseFloat(css.getPropertyValue("--soil-depth")));
      const edge = `rgb(${forest.map((value, index) => Math.round(value + (soil[index] - value) * depth)).join(", ")})`;
      html.style.setProperty("--footer-edge", edge);
      meta.content = bottom ? edge : css.getPropertyValue("--background").trim();
    }
    function queueEdge() { if (!edgeFrame) edgeFrame = requestAnimationFrame(syncEdge); }
    function paint() {
      element!.style.setProperty("--root-reveal", `${reveal.toFixed(3)}px`);
      queueEdge();
    }
    function reset() {
      cancelAnimationFrame(motionFrame); motionFrame = 0;
      reveal = 0; velocity = 0; peak = 0;
      element!.removeAttribute("data-revealing"); paint();
    }
    function animate(time: number) {
      // Input changes the spring's target, never its position or the scrollbar.
      // Turn back after 140ms even if the finger/wheel is still moving.
      const target = time - started < 140 ? peak : 0;
      let remaining = Math.min(32, time - lastFrame) / 1000;
      lastFrame = time;
      while (remaining > 0) {
        const step = Math.min(remaining, .008);
        velocity += ((target - reveal) * 520 - velocity * 42) * step;
        reveal += velocity * step;
        remaining -= step;
      }
      if (reduced.matches || (target === 0 && reveal < .15 && Math.abs(velocity) < 3)) { reset(); return; }
      paint(); motionFrame = requestAnimationFrame(animate);
    }
    function impulse(distance: number) {
      if (distance <= 0 || reduced.matches || !atEnd()) return;
      const now = performance.now();
      if (motionFrame && now - started >= 140) return;
      peak = Math.min(limit(), Math.max(48, peak, distance * .8));
      if (!motionFrame) {
        started = now; lastFrame = now;
        element!.setAttribute("data-revealing", "true");
        motionFrame = requestAnimationFrame(animate);
      }
    }
    function close() { if (motionFrame) started = performance.now() - 140; }
    function scrolling() {
      queueEdge();
      const delta = window.scrollY - previousY;
      previousY = window.scrollY;
      if (delta > 0) impulse(delta);
      else if (delta < 0) close();
    }
    function interactive(target: EventTarget | null) {
      return target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],dialog'));
    }
    function wheel(event: WheelEvent) {
      if (event.ctrlKey || event.defaultPrevented || interactive(event.target)) return;
      if (event.deltaY < 0) { close(); return; }
      impulse(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1));
    }
    function touchStart(event: TouchEvent) {
      touchY = event.touches.length === 1 && !interactive(event.target) ? event.touches[0].clientY : null;
    }
    function touchMove(event: TouchEvent) {
      if (touchY === null || event.touches.length !== 1) { touchY = null; return; }
      const next = event.touches[0].clientY, delta = touchY - next;
      touchY = next;
      if (delta < 0) close(); else impulse(delta * 2);
    }
    function touchEnd() { touchY = null; }
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented || interactive(event.target)) return;
      if (["PageUp", "Home", "ArrowUp"].includes(event.key) || (event.key === " " && event.shiftKey)) close();
      else if (["PageDown", "End", "ArrowDown", " "].includes(event.key)) impulse(event.key === "ArrowDown" ? 48 : 140);
    }
    function resized() {
      // Safari's address bar can resize the viewport during a swipe; do not snap the scene shut.
      if (reduced.matches || window.innerWidth !== previousWidth) reset();
      else { peak = Math.min(peak, limit()); queueEdge(); }
      previousWidth = window.innerWidth; previousY = window.scrollY;
    }
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
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("touchend", touchEnd, { passive: true });
    window.addEventListener("touchcancel", touchEnd, { passive: true });
    window.addEventListener("keydown", keyboard);
    window.addEventListener("resize", resized, { passive: true });
    window.visualViewport?.addEventListener("resize", resized, { passive: true });
    window.visualViewport?.addEventListener("scroll", queueEdge, { passive: true });
    reduced.addEventListener("change", resized);
    queueEdge();
    return () => {
      observer.disconnect(); themeObserver.disconnect(); cancelAnimationFrame(motionFrame); cancelAnimationFrame(edgeFrame);
      window.removeEventListener("scroll", scrolling); window.removeEventListener("wheel", wheel);
      window.removeEventListener("touchstart", touchStart); window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd); window.removeEventListener("touchcancel", touchEnd); window.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", resized);
      window.visualViewport?.removeEventListener("resize", resized); window.visualViewport?.removeEventListener("scroll", queueEdge);
      reduced.removeEventListener("change", resized);
      element.style.removeProperty("--root-reveal"); element.removeAttribute("data-revealing");
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
