"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_CHOICE_EVENT, ANALYTICS_SETTINGS_EVENT, analyticsChoice, analyticsRoute, privacySignal, replayChoice, setAnalyticsChoice, track, type AnalyticsChoice } from "@/lib/ui/telemetry";
import { stopReplay, syncReplay } from "@/lib/ui/session-replay";
import styles from "./analytics-consent.module.css";

export function SiteAnalytics() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null);
  const [replay, setReplay] = useState(false), [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false), [settings, setSettings] = useState(false);
  const lastPage = useRef<string | null>(null);
  const privatePage = analyticsRoute(pathname) === null;
  useEffect(() => {
    const sync = () => { setChoice(analyticsChoice()); setReplay(replayChoice()); setReady(true); setRevision(n => n + 1); };
    const open = () => { setReplay(replayChoice()); setSettings(true); };
    sync(); window.addEventListener(ANALYTICS_CHOICE_EVENT, sync); window.addEventListener("storage", sync); window.addEventListener(ANALYTICS_SETTINGS_EVENT, open);
    return () => { window.removeEventListener(ANALYTICS_CHOICE_EVENT, sync); window.removeEventListener("storage", sync); window.removeEventListener(ANALYTICS_SETTINGS_EVENT, open); };
  }, []);
  // Stop before observers can snapshot a newly rendered private/form route.
  useLayoutEffect(() => {
    void syncReplay();
    const stopBeforeNavigation = () => stopReplay();
    const navigation = (event: Event) => { if (event.target instanceof Element && event.target.closest("a[href]")) stopBeforeNavigation(); };
    document.addEventListener("click", navigation, true);
    window.addEventListener("popstate", stopBeforeNavigation);
    window.addEventListener("pagehide", stopBeforeNavigation);
    window.addEventListener("hashchange", stopBeforeNavigation);
    return () => { stopReplay(); document.removeEventListener("click", navigation, true); window.removeEventListener("popstate", stopBeforeNavigation); window.removeEventListener("pagehide", stopBeforeNavigation); window.removeEventListener("hashchange", stopBeforeNavigation); };
  }, [pathname, revision]);
  useEffect(() => {
    if (choice !== "yes" || privatePage) { lastPage.current = null; return; }
    if (lastPage.current !== pathname) { track("$pageview"); lastPage.current = pathname; }
    let lastActivity = Date.now(), seconds = 0, ticks = 0;
    const depths = new Set<number>();
    const active = () => { lastActivity = Date.now(); };
    const flush = () => { if (seconds) { track("page_engagement", { active_seconds: Math.min(60, seconds) }, pathname); seconds = 0; } };
    const scroll = () => {
      active();
      const travel = document.documentElement.scrollHeight - innerHeight;
      if (travel < 100) return;
      const depth = Math.min(100, Math.floor(scrollY / travel * 100));
      for (const milestone of [25, 50, 75, 100]) if (depth >= milestone && !depths.has(milestone)) { depths.add(milestone); track("scroll_depth", { depth: milestone }); }
    };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); else active(); };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActivity < 60000) seconds += 5;
      if (++ticks % 6 === 0) flush();
      if (ticks % 12 === 0 && document.visibilityState === "visible" && Date.now() - lastActivity < 60000) track("site_active");
    }, 5000);
    window.addEventListener("pointerdown", active, { passive: true }); window.addEventListener("keydown", active); window.addEventListener("scroll", scroll, { passive: true }); document.addEventListener("visibilitychange", visibility);
    return () => { flush(); clearInterval(timer); window.removeEventListener("pointerdown", active); window.removeEventListener("keydown", active); window.removeEventListener("scroll", scroll); document.removeEventListener("visibilitychange", visibility); };
  }, [pathname, choice, privatePage]);
  if (!ready || privatePage) return null;
  const save = (value: AnalyticsChoice) => { setAnalyticsChoice(value, value === "yes" && replay); setSettings(false); };
  if (choice !== null && !settings) return null;
  return <PrivacyNotice replay={replay} setReplay={setReplay} settings={settings} browserSignal={privacySignal()} save={save}/>;
}

// Presentational component shared with the preview-only visual harness.
export function PrivacyNotice({replay,setReplay,settings=false,browserSignal=false,save}:{replay:boolean;setReplay:(value:boolean)=>void;settings?:boolean;browserSignal?:boolean;save:(value:AnalyticsChoice)=>void}) {
  return <section className={styles.notice} aria-label="Privacy choices" data-private>
    <h2>Help improve ISITUSA</h2>
    <p>Optional analytics helps us improve the site. Replay shows masked browsing on public information pages. <a href="/privacy">Privacy details</a></p>
    {browserSignal ? <><p>Your browser privacy preference keeps both off.</p><div className={styles.actions}><button type="button" onClick={() => save("no")}>Done</button></div></> : <>
      <label className={styles.option}><input type="checkbox" checked={replay} onChange={event => setReplay(event.target.checked)} />Allow masked session replay</label>
      <div className={styles.actions}><button type="button" onClick={() => save("yes")}>{settings ? "Save choices" : "Allow analytics"}</button><button type="button" onClick={() => save("no")}>Keep both off</button></div>
    </>}
  </section>;
}
