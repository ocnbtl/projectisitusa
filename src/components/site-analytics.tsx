"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_CHOICE_EVENT, ANALYTICS_SETTINGS_EVENT, analyticsChoice, analyticsRoute, privacySignal, setAnalyticsChoice, track, type AnalyticsChoice } from "@/lib/ui/telemetry";
import styles from "./analytics-consent.module.css";

export function SiteAnalytics() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null);
  const [ready, setReady] = useState(false), [settings, setSettings] = useState(false);
  const lastPage = useRef<string | null>(null);
  const privatePage = analyticsRoute(pathname) === null;
  useEffect(() => {
    const sync = () => { setChoice(analyticsChoice()); setReady(true); };
    const open = () => setSettings(true);
    sync(); window.addEventListener(ANALYTICS_CHOICE_EVENT, sync); window.addEventListener("storage", sync); window.addEventListener(ANALYTICS_SETTINGS_EVENT, open);
    return () => { window.removeEventListener(ANALYTICS_CHOICE_EVENT, sync); window.removeEventListener("storage", sync); window.removeEventListener(ANALYTICS_SETTINGS_EVENT, open); };
  }, []);
  useEffect(() => {
    if (choice !== "yes" || privatePage) { lastPage.current = null; return; }
    if (lastPage.current !== pathname) { track("$pageview"); lastPage.current = pathname; }
    let lastActivity = Date.now();
    const active = () => { lastActivity = Date.now(); };
    const heartbeat = window.setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastActivity < 300000) track("site_active"); }, 60000);
    window.addEventListener("pointerdown", active, { passive: true }); window.addEventListener("keydown", active); window.addEventListener("scroll", active, { passive: true });
    return () => { clearInterval(heartbeat); window.removeEventListener("pointerdown", active); window.removeEventListener("keydown", active); window.removeEventListener("scroll", active); };
  }, [pathname, choice, privatePage]);
  if (!ready || privatePage) return null;
  const save = (value: AnalyticsChoice) => { setAnalyticsChoice(value); setSettings(false); };
  if (choice !== null && !settings) return pathname === "/" ? <button className={styles.settings} type="button" onClick={() => setSettings(true)}>Privacy choices</button> : null;
  return <section className={styles.notice} aria-label="Optional analytics">
    <h2>Help us improve the atlas</h2>
    <p>Allow optional usage analytics to help us improve the website. You can change your choice at any time. <a href="/privacy">Privacy details</a></p>
    {privacySignal() ? <><p>Your browser has asked us not to track. Analytics stays off.</p><div className={styles.actions}><button type="button" onClick={() => save("no")}>Done</button></div></> : <div className={styles.actions}><button type="button" onClick={() => save("yes")}>Allow analytics</button><button type="button" onClick={() => save("no")}>Keep analytics off</button></div>}
  </section>;
}
