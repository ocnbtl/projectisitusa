"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { ANALYTICS_CHOICE_EVENT, analyticsChoice, analyticsRoute, privacySignal, replayChoice, heatmapChoice, setAnalyticsChoice, track, type AnalyticsChoice } from "@/lib/ui/telemetry";
import { stopOptionalCapture, syncReplay } from "@/lib/ui/session-replay";
import { googleAnalyticsChoice, googleMeasurementConfigured, measurementPolicyHardBlocked, resolveGoogleAnalyticsDefault, setGoogleAnalyticsChoice, syncGooglePage } from "@/lib/ui/google-measurement";
import { optionalAnalyticsExcluded } from "@/lib/ui/analytics-privacy";
import styles from "./analytics-consent.module.css";

export function PrivacyChoicesButton({ className }: { className?: string }) {
  return <a href="/privacy#privacy-choices" className={className}>Your Privacy Choices</a>;
}

export function SiteAnalytics() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null);
  const [revision, setRevision] = useState(0);
  const visit = useRef<{ path: string; started: number; left: boolean } | null>(null);
  const documentPage = useRef<string | null>(null);
  const documentChanged = useRef(false);
  useEffect(() => {
    if (documentPage.current === null) documentPage.current = pathname;
    else if (documentPage.current !== pathname) documentChanged.current = true;
  }, [pathname]);
  const reportVital = useCallback((metric: { name: string; value: number }) => {
    // Web Vitals describe a document, not subsequent client-side routes.
    // Send values only: no DOM elements, resource URLs, or attribution payloads.
    if (documentChanged.current || location.pathname !== documentPage.current) return;
    if (["LCP", "INP", "CLS"].includes(metric.name)) {
      track("$web_vitals", { ["$web_vitals_" + metric.name + "_value"]: metric.value });
    }
  }, []);
  useReportWebVitals(reportVital);
  const privatePage = analyticsRoute(pathname) === null;
  useEffect(() => {
    const sync = () => {
      setChoice(analyticsChoice());
      syncGooglePage(location.pathname);
      setRevision(n => n + 1);
    };
    sync(); window.addEventListener(ANALYTICS_CHOICE_EVENT, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(ANALYTICS_CHOICE_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  useLayoutEffect(() => { syncGooglePage(pathname); }, [pathname]);
  useEffect(() => {
    const check = resolveGoogleAnalyticsDefault({ settingsOnly: pathname === "/privacy" });
    if (!check) return;
    let current = true;
    void check.then(() => {
      if (!current) return;
      syncGooglePage(location.pathname);
      window.dispatchEvent(new Event(ANALYTICS_CHOICE_EVENT));
    });
    return () => { current = false; };
  }, [pathname]);
  // Stop before observers can snapshot a newly rendered private/form route.
  useLayoutEffect(() => {
    void syncReplay();
    const stopBeforeNavigation = () => stopOptionalCapture();
    const navigation = (event: Event) => { if (event.target instanceof Element && event.target.closest("a[href]")) stopBeforeNavigation(); };
    document.addEventListener("click", navigation, true);
    window.addEventListener("popstate", stopBeforeNavigation);
    window.addEventListener("pagehide", stopBeforeNavigation);
    window.addEventListener("hashchange", stopBeforeNavigation);
    return () => { stopOptionalCapture(); document.removeEventListener("click", navigation, true); window.removeEventListener("popstate", stopBeforeNavigation); window.removeEventListener("pagehide", stopBeforeNavigation); window.removeEventListener("hashchange", stopBeforeNavigation); };
  }, [pathname, revision]);
  useEffect(() => {
    if (choice !== "yes" || privatePage) { visit.current = null; return; }
    const start = () => {
      if (!visit.current || visit.current.path !== pathname || visit.current.left) {
        track("$pageview", {}, pathname);
        visit.current = { path: pathname, started: Date.now(), left: false };
      }
    };
    start();
    const leave = () => {
      const current = visit.current;
      if (!current || current.path !== pathname || current.left) return;
      current.left = true;
      track("$pageleave", {
        $prev_pageview_pathname: pathname,
        $prev_pageview_duration: Math.min(86400, Math.max(0, (Date.now() - current.started) / 1000)),
      }, pathname);
    };
    const hide = () => { flush(); leave(); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) start(); };
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
    window.addEventListener("pagehide", hide); window.addEventListener("pageshow", show);
    window.addEventListener("pointerdown", active, { passive: true }); window.addEventListener("keydown", active); window.addEventListener("scroll", scroll, { passive: true }); document.addEventListener("visibilitychange", visibility);
    return () => { flush(); if (location.pathname !== pathname) leave(); window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", show); clearInterval(timer); window.removeEventListener("pointerdown", active); window.removeEventListener("keydown", active); window.removeEventListener("scroll", scroll); document.removeEventListener("visibilitychange", visibility); };
  }, [pathname, choice, privatePage]);
  return null;
}

export function PrivacyControls() {
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const sync = () => { setReady(true); setVersion(v => v + 1); };
    const check = resolveGoogleAnalyticsDefault({ settingsOnly: true });
    let active = true;
    if (check) void check.then(() => { if (active) sync(); }); else sync();
    window.addEventListener(ANALYTICS_CHOICE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { active = false; window.removeEventListener(ANALYTICS_CHOICE_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  void version;
  const save = ({site, replay, google, heatmaps=false}: PrivacyPreferences) => {
    if (google !== undefined) setGoogleAnalyticsChoice(google);
    setAnalyticsChoice(site ? "yes" : "no", replay, heatmaps);
    stopOptionalCapture();
    syncGooglePage(location.pathname);
    setMessage("Your choices apply now and are saved in this browser.");
  };
  return <section id="privacy-choices" className={styles.notice} aria-labelledby="privacy-choices-title" data-private>
    <h2 id="privacy-choices-title">Your Privacy Choices</h2>
    <p>Control each service separately. Changes apply immediately and stay saved in this browser.</p>
    {!ready ? <p role="status">Checking your saved choices...</p> : <PrivacyNotice initialSite={analyticsChoice()==="yes"} initialReplay={replayChoice()} initialHeatmaps={heatmapChoice()} google={googleMeasurementConfigured?googleAnalyticsChoice():undefined} googleChecking={false} browserSignal={privacySignal() || optionalAnalyticsExcluded() || measurementPolicyHardBlocked()} onDismiss={()=>{}} onSave={save}/>}
    <p role="status" aria-live="polite">{message}</p>
    <noscript>Optional analytics cannot run without JavaScript.</noscript>
  </section>;
}

type PrivacyPreferences = { site: boolean; google?: boolean; replay: boolean; heatmaps?: boolean };

// Shared with the synthetic preview. This is an inline section, never a dialog.
export function PrivacyNotice({initialSite,initialReplay,initialHeatmaps=false,google,googleChecking,browserSignal,onSave}: {
  initialSite:boolean; initialReplay:boolean; initialHeatmaps?:boolean; google?:boolean; googleChecking:boolean;
  browserSignal:boolean; onDismiss:()=>void; onSave:(choices:PrivacyPreferences)=>void;
}) {
  return <div className={styles.controls}>
    {browserSignal && <p>A privacy signal or staff exclusion keeps optional analytics and replay off in this browser.</p>}
    <fieldset disabled={browserSignal || googleChecking}>
      <legend>Optional measurement</legend>
      {google!==undefined && <label className={styles.option}><input type="checkbox" checked={!browserSignal && google} onChange={e=>onSave({site:initialSite,replay:initialReplay,heatmaps:initialHeatmaps,google:e.target.checked})}/><span>Google Analytics<small>Counts visits and public browsing actions. Starts on only for eligible confirmed U.S. visits.</small></span></label>}
      <label className={styles.option}><input type="checkbox" checked={!browserSignal && initialSite} onChange={e=>onSave({site:e.target.checked,replay:initialReplay,heatmaps:initialHeatmaps})}/><span>Site analytics<small>Measures public browsing with random browser and visit IDs. Starts on only for eligible confirmed U.S. visits.</small></span></label>
      <label className={styles.option}><input type="checkbox" checked={!browserSignal && initialReplay} onChange={e=>onSave({site:initialSite,replay:e.target.checked,heatmaps:initialHeatmaps})}/><span>Masked session replay<small>Recordings are limited to About and Brand. Inputs and private content are excluded. Starts on only for eligible confirmed U.S. visits.</small></span></label>
      <label className={styles.option}><input type="checkbox" checked={!browserSignal && initialHeatmaps} onChange={e=>onSave({site:initialSite,replay:initialReplay,heatmaps:e.target.checked})}/><span>Heatmaps<small>Counts pointer positions on About and Brand only, without text or element identifiers. Starts on only for eligible confirmed U.S. visits.</small></span></label>
    </fieldset>
    <div className={styles.actions}><button type="button" onClick={()=>onSave({site:false,replay:false,heatmaps:false,google:false})}>Turn all off</button></div>
  </div>;
}
