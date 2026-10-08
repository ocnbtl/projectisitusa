// Explicit PostHog events only. No autocapture, replay, identification, or form values.
export const ANALYTICS_CHOICE_KEY = "isitusa.analytics-choice.v1";
export const ANALYTICS_CHOICE_EVENT = "isitusa:analytics-choice";
export const ANALYTICS_SETTINGS_EVENT = "isitusa:analytics-settings";
const ID_KEY = "isitusa.analytics-id.v1", SESSION_KEY = "isitusa.analytics-session.v1";
const TOKEN = "phc_BqJFVdN3fJkmLaaaVkDkLbsBgHrLk2v2cbMGTMCCq8dw"; // Public ingestion token, project 644720.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AnalyticsChoice = "yes" | "no";
export const EVENTS = ["$pageview", "site_active", "county_selected", "map_filter_changed", "zip_search_completed", "species_search_completed", "species_opened", "directory_view_changed", "evidence_opened", "source_opened", "county_card_downloaded", "signup_requested", "signup_request_accepted", "signup_request_failed", "sighting_started", "sighting_submitted", "sighting_failed", "contribution_method_selected", "checkout_started", "checkout_opened", "checkout_failed", "crypto_address_copied"] as const;
export type AnalyticsEvent = typeof EVENTS[number];
export type EventProperties = Record<string, string | number | boolean | undefined>;
const ENUMS: Record<string, readonly string[]> = {
  surface: ["map", "directory", "species", "research", "support", "join", "report"],
  outcome: ["found", "empty", "failed"], view: ["rows", "grid", "compact"],
  frequency: ["once", "monthly"], method: ["card", "crypto"], asset: ["BTC", "ETH", "SOL", "XMR", "XRP", "USDC"],
  format: ["png", "svg"], category: ["plants", "insects", "animals", "fungi", "all", "other"],
  result_bucket: ["0", "1-10", "11-100", "101+"],
};
export function resultBucket(count: number) { return count < 1 ? "0" : count <= 10 ? "1-10" : count <= 100 ? "11-100" : "101+"; }
export function analyticsRoute(pathname: string): string | null {
  if (["/admin", "/auth", "/preferences"].some(p => pathname === p || pathname.startsWith(p + "/"))) return null;
  if (["/", "/species", "/research", "/about", "/support", "/join", "/report", "/privacy", "/terms", "/brand"].includes(pathname)) return pathname;
  if (/^\/species\/[^/]+\/?$/.test(pathname)) return "/species/[species]";
  return "/not-found";
}
export function safeProperties(properties: EventProperties): EventProperties {
  const result: EventProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && ENUMS[key]?.includes(value)) result[key] = value;
    if (["species_id", "source_id"].includes(key) && typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(value)) result[key] = value;
    if (key === "county_id" && typeof value === "string" && /^\d{5}$/.test(value)) result[key] = value;
  }
  return result;
}
export function privacySignal(): boolean {
  return typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
}
let withdrawn = false;
export function analyticsChoice(): AnalyticsChoice | null {
  if (typeof window === "undefined") return null;
  if (withdrawn || privacySignal()) return "no";
  try { const value = localStorage.getItem(ANALYTICS_CHOICE_KEY); return value === "yes" || value === "no" ? value : null; } catch { return "no"; }
}
export function setAnalyticsChoice(value: AnalyticsChoice) {
  withdrawn = value === "no";
  try { localStorage.setItem(ANALYTICS_CHOICE_KEY, value); if (value === "no") { localStorage.removeItem(ID_KEY); localStorage.removeItem(SESSION_KEY); } } catch { /* Storage denial disables capture. */ }
  window.dispatchEvent(new Event(ANALYTICS_CHOICE_EVENT));
}
let minuteStart = 0, minuteCount = 0;
export function track(event: AnalyticsEvent, properties: EventProperties = {}): void {
  if (typeof window === "undefined" || analyticsChoice() !== "yes" || !EVENTS.includes(event)) return;
  const route = analyticsRoute(window.location.pathname);
  if (!route || !["isitusa.com", "www.isitusa.com"].includes(window.location.hostname)) return;
  const now = Date.now();
  if (now - minuteStart >= 60000) { minuteStart = now; minuteCount = 0; }
  if (minuteCount >= 30) return;
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id || !UUID.test(id)) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id); }
    let session: { id: string; last: number; count: number } | null = null;
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { /* Replace malformed state. */ }
    if (!session || !UUID.test(session.id) || !Number.isFinite(session.last) || !Number.isFinite(session.count) || now - session.last > 1800000) session = { id: crypto.randomUUID(), last: now, count: 0 };
    if (session.count >= 500) return;
    session.last = now; session.count++; minuteCount++;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    const body = JSON.stringify({ api_key: TOKEN, distinct_id: id, event, timestamp: new Date(now).toISOString(), properties: {
      ...safeProperties(properties), $current_url: "https://isitusa.com" + route, $pathname: route,
      $host: "isitusa.com", $session_id: session.id, $process_person_profile: false, $is_identified: false,
      $geoip_disable: true, $ip: "0.0.0.0", ip: "0.0.0.0", schema_version: 1, environment: "production",
      viewport: window.innerWidth < 640 ? "phone" : window.innerWidth < 1024 ? "tablet" : "desktop",
    } });
    void fetch("https://us.i.posthog.com/i/v0/e/", { method: "POST", body, headers: { "Content-Type": "text/plain" }, credentials: "omit", referrerPolicy: "no-referrer", keepalive: true }).catch(() => {});
  } catch { /* Analytics must never block a visitor's task. */ }
}
