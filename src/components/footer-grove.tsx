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
    let mouseHeld = false, autoScroll = false, keyHeld = false;
    let scrollTime = performance.now(), scrollSpeed = 0, wasAtEnd = false;
    let mouseDistance = 0;
    let mouseAnchor = 0;
    const scrollLimit = () => Math.max(0, html.scrollHeight - window.innerHeight);
    // Safari exposes rubber-band travel in scrollY. It is not a new gesture.
    const scrollPosition = () => Math.max(0, Math.min(scrollLimit(), window.scrollY));
    let previousY = scrollPosition(), previousWidth = window.innerWidth, previousHeight = window.innerHeight, touchY: number | null = null;
    const atEnd = () => scrollLimit() - scrollPosition() <= 3;
    wasAtEnd = atEnd();
    const limit = () => 240; // Match the complete soil/root artwork, including its bottom edge.
    const held = () => touchY !== null || mouseHeld || autoScroll || keyHeld;
    let palette = { forest: [0, 88, 59], soil: [213, 217, 189], depth: 180, background: "#edf3ef" };
    let lastEdge = "";
    function readPalette() {
      const css = getComputedStyle(element!);
      const channels = (name: string) => {
        const hex = css.getPropertyValue(name).trim().replace("#", "");
        return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
      };
      palette = { forest: channels("--grove-ink"), soil: channels("--soil-base"), depth: parseFloat(css.getPropertyValue("--soil-depth")), background: css.getPropertyValue("--background").trim() };
    }
    function syncEdge() {
      edgeFrame = 0;
      const rect = element!.getBoundingClientRect();
      const bottom = rect.top < window.innerHeight && rect.bottom <= window.innerHeight + 48;
      // Arm before arriving, rather than switching native bounce policy mid-swipe.
      html.classList.toggle("footer-scroll-ready", rect.top < window.innerHeight + 200);
      html.classList.toggle("footer-at-end", bottom);
      const { forest, soil } = palette;
      const depth = Math.min(1, reveal / palette.depth);
      const edge = `rgb(${forest.map((value, index) => Math.round(value + (soil[index] - value) * depth)).join(", ")})`;
      if (edge !== lastEdge) { html.style.setProperty("--footer-edge", edge); lastEdge = edge; }
      // Safari's toolbar is browser chrome, not part of our animation layer.
      // Repainting its theme every frame makes it flash during a quick reveal.
      const chromeColor = bottom ? `rgb(${forest.join(", ")})` : palette.background;
      if (meta.content !== chromeColor) meta.content = chromeColor;
    }
    function queueEdge() { if (!edgeFrame) edgeFrame = requestAnimationFrame(syncEdge); }
    function paint() {
      // Keep the fine dot masks on the same physical-pixel grid while moving.
      // Quantize only the painted position; spring position/velocity stay continuous.
      const pixelRatio = window.devicePixelRatio || 1;
      const painted = `${Math.round(reveal * pixelRatio) / pixelRatio}px`;
      element!.style.setProperty("--root-reveal", painted);
      footer?.style.setProperty("--footer-pull", painted);
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
      const position = scrollPosition();
      const now = performance.now(), delta = position - previousY;
      const elapsed = Math.max(8, now - scrollTime), end = atEnd();
      // The final delta is truncated at the edge. Preserve the approach velocity
      // so a released touch fling or native auto-scroll can carry into the roots.
      const incomingSpeed = now - scrollTime < 160 ? scrollSpeed : 0;
      if (delta > 0) {
        scrollSpeed = delta / elapsed;
        if (end && !wasAtEnd && now - lastInput > 80 && !reduced.matches) {
          const arrivalSpeed = Math.min(3, Math.max(scrollSpeed, incomingSpeed));
          // Released momentum gets one continuous spring arc, not a timed
          // open-then-close target switch. Active fingers already drive impulse.
          if (!held()) {
            inputSpeed = arrivalSpeed;
            target = 0; returning = true; returnFrequency = 9 + arrivalSpeed;
            velocity = Math.max(velocity, arrivalSpeed * 1800);
            lastInput = now; start();
          }
          if ((mouseHeld || autoScroll) && mouseDistance > 4) impulse(mouseDistance * 3);
        }
      } else if (delta < 0 && !end) { scrollSpeed = 0; close(); }
      previousY = position; scrollTime = now;
      // Small edge/toolbar fluctuations cannot repeatedly inject momentum.
      if (end) wasAtEnd = true;
      else if (scrollLimit() - position > 32) wasAtEnd = false;
    }
    function interactive(target: EventTarget | null) {
      return target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],dialog'));
    }
    function wheel(event: WheelEvent) {
      if (event.ctrlKey || event.defaultPrevented || interactive(event.target)) return;
      autoScroll = false;
      if (event.deltaY < 0) { close(); return; }
      impulse(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1));
    }
    function touchStart(event: TouchEvent) {
      autoScroll = false;
      touchY = event.touches.length === 1 && !interactive(event.target) ? event.touches[0].clientY : null;
      if (touchY === null) { close(); return; }
      if (atEnd() && reveal > 0) { target = reveal; returning = false; lastInput = performance.now(); start(); }
    }
    function touchMove(event: TouchEvent) {
      if (touchY === null || event.touches.length !== 1) { touchEnd(); return; }
      const next = event.touches[0].clientY, delta = touchY - next;
      touchY = next;
      if (delta < 0 && (target > 0 || reveal > 0)) {
        if (returning) target = reveal;
        returning = false;
        target = Math.max(0, target + delta * .72); lastInput = performance.now(); start();
      } else impulse(delta);
    }
    function touchEnd() { touchY = null; if (!held()) close(); }
    function mouseDown(event: MouseEvent) {
      // Observe native middle-click auto-scroll without preventing browser scrolling.
      if (autoScroll) { autoScroll = false; mouseHeld = false; close(); return; }
      if (event.button === 1 && !interactive(event.target) && !(event.target instanceof Element && event.target.closest('a,button'))) {
        mouseHeld = true; mouseAnchor = event.clientY; mouseDistance = 0;
      }
    }
    function mouseMove(event: MouseEvent) {
      if (!mouseHeld && !autoScroll) return;
      mouseDistance = event.clientY - mouseAnchor;
      if (!atEnd()) return;
      if (mouseDistance < -4) close();
      else if (mouseDistance > 4) impulse(mouseDistance * 3);
    }
    function mouseUp(event: MouseEvent) {
      if (event.button !== 1 || !mouseHeld) return;
      // A click enters toggle mode; a held-button drag ends on release.
      autoScroll = Math.abs(mouseDistance) <= 4;
      mouseHeld = false;
      if (!held()) close();
    }
    function keyboard(event: KeyboardEvent) {
      if (autoScroll) { autoScroll = false; close(); }
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
    function cancelGesture() { touchY = null; mouseHeld = false; autoScroll = false; keyHeld = false; close(); }
    function resized() {
      // Safari's address bar can resize the viewport during a swipe; do not snap the scene shut.
      if (reduced.matches || window.innerWidth !== previousWidth) {
        cancelGesture(); reset(); previousY = scrollPosition(); wasAtEnd = atEnd();
        scrollTime = performance.now(); scrollSpeed = 0;
      } else if (window.innerHeight !== previousHeight) {
        // A browser-toolbar adjustment is geometry, not a velocity sample.
        previousY = scrollPosition();
        if (atEnd()) wasAtEnd = true;
      }
      readPalette(); queueEdge(); previousHeight = window.innerHeight;
      previousWidth = window.innerWidth;
    }
    const observer = new IntersectionObserver(queueEdge);
    observer.observe(element);
    let dark = html.classList.contains("dark");
    const themeObserver = new MutationObserver(() => {
      const next = html.classList.contains("dark");
      if (dark !== next) { dark = next; readPalette(); queueEdge(); }
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
    readPalette(); queueEdge();
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
      html.classList.remove("footer-at-end", "footer-scroll-ready"); html.style.removeProperty("--footer-edge");
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
