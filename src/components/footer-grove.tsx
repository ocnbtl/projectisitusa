"use client";

import { useEffect, useRef } from "react";

/** A gesture-driven elastic reveal, outside the resting page's scroll range. */
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
    const footer = element.closest<HTMLElement>("footer");
    let reveal = 0, velocity = 0, target = 0, lastFrame = 0;
    let lastInput = -1000, inputSpeed = .5, returnFrequency = 14, returning = false;
    let mouseHeld = false, keyHeld = false;
    let mouseAnchor = 0;
    let previousY = window.scrollY, previousWidth = window.innerWidth, touchY: number | null = null;
    const atEnd = () => html.scrollHeight - window.innerHeight - window.scrollY <= 3;
    const limit = () => 240; // Match the complete soil/root artwork, including its bottom edge.
    const held = () => touchY !== null || mouseHeld || keyHeld;
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
      footer?.style.setProperty("--footer-pull", `${reveal.toFixed(3)}px`);
      queueEdge();
    }
    function reset() {
      cancelAnimationFrame(motionFrame); motionFrame = 0;
      reveal = 0; velocity = 0; target = 0; returning = false;
      element!.removeAttribute("data-revealing"); paint();
    }
    function animate(time: number) {
      // Wheel/trackpad events have no release event. A short quiet interval ends
      // that gesture; explicit finger/button/key holds never use this timeout.
      if (!returning && !held() && time - lastInput > 130) close();
      const frequency = returning ? returnFrequency : 30;
      let remaining = Math.min(32, time - lastFrame) / 1000;
      lastFrame = time;
      while (remaining > 0) {
        const step = Math.min(remaining, .008);
        velocity += ((target - reveal) * frequency * frequency - velocity * 2 * frequency) * step;
        reveal += velocity * step;
        if (reveal > limit()) { reveal = limit(); velocity = Math.min(0, velocity); }
        if (reveal < 0) { reveal = 0; velocity = Math.max(0, velocity); }
        remaining -= step;
      }
      if (reduced.matches || (target === 0 && reveal < .15 && Math.abs(velocity) < 3)) { reset(); return; }
      paint();
      if (!returning && held() && Math.abs(target - reveal) < .1 && Math.abs(velocity) < 1) { motionFrame = 0; return; }
      motionFrame = requestAnimationFrame(animate);
    }
    function start() {
      if (!motionFrame) {
        lastFrame = performance.now();
        element!.setAttribute("data-revealing", "true");
        motionFrame = requestAnimationFrame(animate);
      }
    }
    function impulse(distance: number) {
      if (distance <= 0 || reduced.matches || !atEnd()) return;
      const now = performance.now();
      const gap = now - lastInput;
      const speed = Math.min(3, distance / Math.max(16, Math.min(80, gap)));
      inputSpeed = gap > 180 ? speed : inputSpeed * .55 + speed * .45;
      if (returning) target = reveal;
      returning = false;
      target = Math.min(limit(), target + distance * .72);
      lastInput = now; start();
    }
    function close() {
      if (returning || (target === 0 && reveal === 0)) return;
      // Preserve the current position/velocity when changing direction. A brisk
      // gesture returns more briskly, within comfortable critically damped bounds.
      returnFrequency = 11 + Math.min(3, inputSpeed) * 4;
      target = 0; returning = true; start();
    }
    function scrolling() {
      queueEdge();
      const delta = window.scrollY - previousY;
      previousY = window.scrollY;
      if (delta > 0 && performance.now() - lastInput > 80 && !returning) impulse(Math.min(80, delta));
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
      if (touchY === null) { close(); return; }
      if (atEnd() && reveal > 0) { target = reveal; returning = false; lastInput = performance.now(); start(); }
    }
    function touchMove(event: TouchEvent) {
      if (touchY === null || event.touches.length !== 1) { touchEnd(); return; }
      const next = event.touches[0].clientY, delta = touchY - next;
      touchY = next;
      if (delta < 0 && (target > 0 || reveal > 0)) {
        target = Math.max(0, target + delta * .72); lastInput = performance.now(); start();
      } else impulse(delta);
    }
    function touchEnd() { touchY = null; if (!held()) close(); }
    function mouseDown(event: MouseEvent) {
      if (event.button === 1 && !interactive(event.target)) { mouseHeld = true; mouseAnchor = event.clientY; }
    }
    function mouseMove(event: MouseEvent) {
      if (!mouseHeld || !atEnd()) return;
      const distance = event.clientY - mouseAnchor;
      if (distance < -4) close();
      else if (distance > 4) impulse(distance * 3);
    }
    function mouseUp(event: MouseEvent) { if (event.button === 1) { mouseHeld = false; if (!held()) close(); } }
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented || interactive(event.target)) return;
      if (["PageUp", "Home", "ArrowUp"].includes(event.key) || (event.key === " " && event.shiftKey)) close();
      else if (["PageDown", "End", "ArrowDown", " "].includes(event.key)) {
        if (event.target instanceof Element && event.target.closest('a,button')) return;
        keyHeld = true; impulse(event.key === "ArrowDown" ? 48 : 140);
      }
    }
    function keyUp(event: KeyboardEvent) {
      if (["PageDown", "End", "ArrowDown", " "].includes(event.key)) { keyHeld = false; if (!held()) close(); }
    }
    function cancelGesture() { touchY = null; mouseHeld = false; keyHeld = false; close(); }
    function resized() {
      // Safari's address bar can resize the viewport during a swipe; do not snap the scene shut.
      if (reduced.matches || window.innerWidth !== previousWidth) { cancelGesture(); reset(); }
      else queueEdge();
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
    window.addEventListener("keyup", keyUp);
    window.addEventListener("mousedown", mouseDown, { passive: true });
    window.addEventListener("mouseup", mouseUp, { passive: true });
    window.addEventListener("mousemove", mouseMove, { passive: true });
    window.addEventListener("blur", cancelGesture);
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
      window.removeEventListener("keyup", keyUp); window.removeEventListener("mousedown", mouseDown); window.removeEventListener("mouseup", mouseUp); window.removeEventListener("mousemove", mouseMove); window.removeEventListener("blur", cancelGesture);
      window.removeEventListener("resize", resized);
      window.visualViewport?.removeEventListener("resize", resized); window.visualViewport?.removeEventListener("scroll", queueEdge);
      reduced.removeEventListener("change", resized);
      element.style.removeProperty("--root-reveal"); element.removeAttribute("data-revealing");
      footer?.style.removeProperty("--footer-pull");
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
