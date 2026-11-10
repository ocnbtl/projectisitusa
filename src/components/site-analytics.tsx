"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { ANALYTICS_CHOICE_EVENT, ANALYTICS_SETTINGS_EVENT, analyticsChoice, analyticsRoute, privacySignal, replayChoice, setAnalyticsChoice, track, type AnalyticsChoice } from "@/lib/ui/telemetry";
import { stopReplay, syncReplay } from "@/lib/ui/session-replay";
import { googleAnalyticsChoice, googleMeasurementConfigured, resolveGoogleAnalyticsDefault, setGoogleAnalyticsChoice, syncGooglePage } from "@/lib/ui/google-measurement";
import styles from "./analytics-consent.module.css";

export function PrivacyChoicesButton({ className }: { className?: string }) {
  return <button type="button" className={className}
    onClick={() => window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT))}>
    Privacy choices
  </button>;
}

export function SiteAnalytics() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null);
  const [revision, setRevision] = useState(0);
  const [settings, setSettings] = useState(false);
  const [googleChecking, setGoogleChecking] = useState(false);
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
    const open = () => setSettings(true);
    sync(); window.addEventListener(ANALYTICS_CHOICE_EVENT, sync); window.addEventListener("storage", sync); window.addEventListener(ANALYTICS_SETTINGS_EVENT, open);
    return () => { window.removeEventListener(ANALYTICS_CHOICE_EVENT, sync); window.removeEventListener("storage", sync); window.removeEventListener(ANALYTICS_SETTINGS_EVENT, open); };
  }, []);
  useLayoutEffect(() => { syncGooglePage(pathname); }, [pathname]);
  useEffect(() => {
    const check = resolveGoogleAnalyticsDefault();
    if (!check) { setGoogleChecking(false); return; }
    let current = true;
    setGoogleChecking(true);
    void check.then(() => {
      if (!current) return;
      syncGooglePage(location.pathname);
      setGoogleChecking(false);
    });
    return () => { current = false; };
  }, [pathname]);
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
  if (!settings || privatePage) return null;
  const save = ({ site, google, replay }: PrivacyPreferences) => {
    if (googleMeasurementConfigured && google !== undefined) setGoogleAnalyticsChoice(google);
    setAnalyticsChoice(site ? "yes" : "no", site && replay);
    setSettings(false);
  };
  return <PrivacyNotice
    initialSite={choice === "yes"}
    initialReplay={replayChoice()}
    google={googleMeasurementConfigured ? googleAnalyticsChoice() : undefined}
    googleChecking={googleChecking}
    browserSignal={privacySignal()}
    onDismiss={() => setSettings(false)}
    onSave={save}
  />;
}

type PrivacyPreferences = { site: boolean; google?: boolean; replay: boolean };

function PrivacyNotice({ initialSite, initialReplay, google, googleChecking, browserSignal, onDismiss, onSave }: {
  initialSite: boolean;
  initialReplay: boolean;
  google?: boolean;
  googleChecking: boolean;
  browserSignal: boolean;
  onDismiss: () => void;
  onSave: (choices: PrivacyPreferences) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [site, setSite] = useState(initialSite);
  const [replay, setReplay] = useState(initialReplay);
  const [googleDraft, setGoogleDraft] = useState<boolean>();
  const googleChecked = googleDraft ?? google ?? false;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialog} className={styles.notice} aria-labelledby="privacy-choices-title" data-private
    onCancel={event => { event.preventDefault(); onDismiss(); }}>
    <div className={styles.title}>
      <h2 id="privacy-choices-title">Privacy choices</h2>
      <button type="button" className={styles.close} aria-label="Close privacy choices" onClick={onDismiss}>×</button>
    </div>
    {browserSignal ? <p>Your browser keeps optional analytics off.</p> : <>
      {google !== undefined && <>
        <label className={styles.option}>
          <input type="checkbox" checked={googleChecked} disabled={googleChecking} onChange={event => setGoogleDraft(event.target.checked)} />
          Google Analytics
        </label>
        <p className={styles.hint}>Uses cookies to measure visits.</p>
      </>}
      <label className={styles.option}><input type="checkbox" checked={site} onChange={event => setSite(event.target.checked)} />Site analytics</label>
      <label className={styles.option}><input type="checkbox" checked={site && replay} disabled={!site} onChange={event => setReplay(event.target.checked)} />Masked session replay</label>
      <div className={styles.actions}>
        <button type="button" disabled={googleChecking} onClick={() => onSave({ site, replay, google: googleDraft })}>Save choices</button>
        <button type="button" onClick={() => onSave({ site: false, replay: false, google: false })}>Turn all off</button>
      </div>
    </>}
    <a href="/privacy">Privacy policy</a>
  </dialog>;
}
