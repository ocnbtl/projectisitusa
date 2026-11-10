const origin = "https://isitusa.com";
const measurementId = process.env.NEXT_PUBLIC_ISITUSA_GA4_ID || "";
const choiceKey = "isitusa.google-analytics-choice.v1";
const exclusionKey = "isitusa.analytics-exclude.v1";
const cookiePrefix = "isitusa_ga4";
const framePath = "/measurement/ga4.html";
const pages = new Map([
  ["/", "Map"], ["/species", "Species directory"], ["/research", "Research"],
  ["/about", "About"], ["/support", "Support"], ["/join", "Email updates"],
  ["/report", "Report a sighting"], ["/volunteer", "Volunteer"],
  ["/approach", "Our approach"], ["/data-sources", "Data sources"],
  ["/credits", "Credits"], ["/observations", "Reviewed sightings"],
  ["/brand", "Brand kit"], ["/privacy", "Privacy"], ["/terms", "Terms"],
]);

const referrerHosts = new Set([
  "google.com", "google.ca", "google.co.uk", "google.com.au",
  "bing.com", "duckduckgo.com", "search.yahoo.com", "search.brave.com",
  "chatgpt.com", "perplexity.ai", "gemini.google.com", "copilot.microsoft.com",
  "facebook.com", "instagram.com", "tiktok.com", "x.com", "reddit.com",
]);

type MeasurementEvent = {
  name: string;
  page: string;
  title: string;
  fields: Record<string, string>;
};

let frame: HTMLIFrameElement | null = null;
let ready = false;
let pending: MeasurementEvent[] = [];
let lastPath: string | null = null;
let previousPage = "";
let explicitlyWithdrawn = false;
const outcomeReceipts = new Set<string>();

export const googleMeasurementConfigured = /^G-[A-Z0-9]{6,16}$/.test(measurementId);

export function googlePage(pathname: string) {
  const path = pathname === "/" ? pathname : pathname.replace(/\/$/, "");
  const title = pages.get(path);
  if (title) return { page: path, title };
  if (/^\/species\/page\/[2-9]\d*$|^\/species\/page\/1\d+$/.test(path)) {
    return { page: "/species", title: "Species directory" };
  }
  if (/^\/species\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) {
    return { page: "/species/profile", title: "Species profile" };
  }
  return null;
}

export function safeGoogleReferrer(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    return url.protocol === "https:" && referrerHosts.has(host) ? "https://" + host + "/" : "";
  } catch {
    return "";
  }
}

export function googleAnalyticsChoice() {
  if (typeof window === "undefined" || explicitlyWithdrawn || !googleMeasurementConfigured) return false;
  if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return false;
  try {
    return localStorage.getItem("isitusa.analytics-choice.v1") === "yes" &&
      localStorage.getItem(choiceKey) === "yes";
  } catch {
    return false;
  }
}

function staffExcluded() {
  try {
    if (new URLSearchParams(location.search).get("analytics") === "off") {
      localStorage.setItem(exclusionKey, "yes");
    }
    return navigator.webdriver || localStorage.getItem(exclusionKey) === "yes";
  } catch {
    return true;
  }
}

function mayMeasure() {
  return typeof window !== "undefined" && location.origin === origin &&
    !staffExcluded() && googleAnalyticsChoice() && googlePage(location.pathname) !== null;
}

export function stopGoogleMeasurement() {
  // Set the vendor opt-out before destroying the document so its unload
  // listeners cannot emit a final engagement event after withdrawal.
  if (frame?.contentWindow) {
    (frame.contentWindow as Window & Record<string, unknown>)["ga-disable-" + measurementId] = true;
  }
  frame?.remove();
  frame = null;
  ready = false;
  pending = [];
  lastPath = null;
  previousPage = "";
}

function clearGoogleCookies() {
  try {
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.trim().split("=")[0];
      if (name.startsWith(cookiePrefix + "_") && /^[\w-]+$/.test(name)) {
        document.cookie = name + "=; Max-Age=0; Path=/; Secure; SameSite=Lax";
      }
    }
  } catch { /* A browser may block cookie access. The frame is already stopped. */ }
}

export function setGoogleAnalyticsChoice(enabled: boolean) {
  explicitlyWithdrawn = !enabled;
  if (!enabled) {
    stopGoogleMeasurement();
    clearGoogleCookies();
  }
  try {
    localStorage.setItem(choiceKey, enabled ? "yes" : "no");
  } catch { /* No stored consent means no collection. */ }
}

function post(event: MeasurementEvent) {
  frame?.contentWindow?.postMessage({ type: "isitusa-ga4-event", event }, origin);
}

function send(event: MeasurementEvent) {
  if (!mayMeasure()) return;
  if (!frame) {
    const element = document.createElement("iframe");
    element.hidden = true;
    element.title = "Optional site measurement";
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("sandbox", "allow-scripts allow-same-origin");
    element.referrerPolicy = "no-referrer";
    element.src = framePath;
    element.addEventListener("load", () => {
      if (frame !== element || !mayMeasure()) return;
      element.contentWindow?.postMessage({ type: "isitusa-ga4-start", measurementId }, origin);
      ready = true;
      for (const item of pending) post(item);
      pending = [];
    }, { once: true });
    frame = element;
    document.body.append(element);
  }
  if (ready) post(event);
  else if (pending.length < 30) pending.push(event);
}

export function syncGooglePage(pathname: string) {
  if (!googleMeasurementConfigured || location.origin !== origin) return;
  const page = googlePage(pathname);
  if (!mayMeasure() || !page) {
    stopGoogleMeasurement();
    if (!googleAnalyticsChoice()) clearGoogleCookies();
    return;
  }
  if (lastPath === pathname) return;
  const referrer = previousPage || (lastPath === null ? safeGoogleReferrer(document.referrer) : "");
  lastPath = pathname;
  previousPage = origin + page.page;
  send({ ...page, name: "page_view", fields: { page_referrer: referrer } });
}

const surfaces = new Set(["map", "directory", "species", "research", "support", "join", "report", "volunteer"]);
const outcomes = new Set(["found", "empty", "failed"]);
const errorJourneys = new Map([
  ["signup_request_failed", "email_updates"], ["sighting_failed", "sighting"],
  ["checkout_failed", "checkout"], ["volunteer_failed", "volunteer"],
]);

export function trackGoogleEvent(name: string, properties: Record<string, unknown> = {}, receipt?: string) {
  if (!mayMeasure()) return;
  const page = googlePage(location.pathname);
  if (!page) return;
  const fields: Record<string, string> = {};
  const surface = properties.surface;
  if (typeof surface === "string" && surfaces.has(surface)) fields.surface = surface;
  if (name === "zip_search_completed" || name === "species_search_completed") {
    fields.search_kind = name === "zip_search_completed" ? "county_or_zip" : "species";
    const outcome = properties.outcome;
    if (typeof outcome !== "string" || !outcomes.has(outcome)) return;
    fields.outcome = outcome;
    name = "catalog_search";
  } else if (errorJourneys.has(name)) {
    fields.journey = errorJourneys.get(name)!;
    name = "journey_error";
  } else if (name === "sighting_submitted" || name === "volunteer_submitted") {
    if (!receipt || !/^[a-z0-9-]{8,80}$/i.test(receipt)) return;
    const key = name + ":" + receipt;
    if (outcomeReceipts.has(key)) return;
    try {
      if (sessionStorage.getItem("isitusa.ga4.receipt." + key)) return;
      sessionStorage.setItem("isitusa.ga4.receipt." + key, "1");
    } catch { /* The in-memory guard still covers duplicate responses. */ }
    outcomeReceipts.add(key);
  } else if (!["county_selected", "evidence_opened", "source_opened", "signup_request_accepted"].includes(name)) {
    return;
  }
  syncGooglePage(location.pathname);
  send({ ...page, name, fields });
}
