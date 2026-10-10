import { ANALYTICS_TOKEN, analyticsRoute, replayChoice } from "./telemetry";

// Only public information pages. No atlas location searches, checkout, intake,
// subscriptions, authentication or team pages enter a recording.
export function replayRouteAllowed(path: string): boolean {
  return ["/about", "/research", "/species", "/brand"].includes(path) || /^\/species\/[a-z0-9-]+\/?$/.test(path);
}
export function replayAllowed(): boolean {
  return typeof window !== "undefined" && replayChoice()
    && ["isitusa.com", "www.isitusa.com"].includes(location.hostname)
    && !location.search && !location.hash && replayRouteAllowed(location.pathname);
}
type ReplayClient = {
  startSessionRecording(): void;
  stopSessionRecording(): void;
  opt_in_capturing(options?: Record<string, unknown>): void;
  opt_out_capturing(options?: Record<string, unknown>): void;
};
type CaptureEvent = { event: string; properties: Record<string, unknown> };
type ReplayWindow = Window & { posthog?: ReplayClient | (unknown[] & { _i: unknown[]; __SV: number; people: unknown[] }) };
let client: ReplayClient | undefined;
let loading: Promise<void> | undefined;
let permitted = false;

export function stopReplay() {
  permitted = false;
  client?.stopSessionRecording();
  client?.opt_out_capturing({ clear_persistence: true });
}
export async function syncReplay() {
  if (!replayAllowed()) { stopReplay(); return; }
  permitted = true;
  if (client) {
    client.opt_in_capturing({ captureEventName: false });
    client.startSessionRecording();
    return;
  }
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const configuration = {
      api_host: "https://us.i.posthog.com", defaults: "2026-05-30",
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      capture_exceptions: false, capture_performance: false,
      enable_recording_console_log: false, disable_session_recording: true,
      disable_surveys: true, enable_heatmaps: false, person_profiles: "never",
      persistence: "memory", opt_out_capturing_by_default: true,
      ip: false, save_referrer: false, save_campaign_params: false,
      session_recording: {
        maskAllInputs: true, maskTextSelector: "*", maskAllElementAttributes: true,
        blockSelector: "form, input, textarea, select, iframe, [contenteditable], [data-private], [role=dialog]",
        recordCrossOriginIframes: false, recordCanvas: false,
        recordHeaders: false, recordBody: false, recordPerformance: false,
        maskCapturedNetworkRequestFn: (request: { name?: string }) => {
          // This callback also redacts replay's page-location metadata.
          if (request.name) request.name = "https://isitusa.com" + (analyticsRoute(location.pathname) || "/");
          return request;
        },
      },
      before_send: (event: CaptureEvent | null) => {
        if (!event || !permitted || !replayAllowed() || !["$snapshot", "$$heatmap"].includes(event.event)) return null;
        if (event.event === "$$heatmap") return null;
        for (const key of Object.keys(event.properties)) {
          if (/url|pathname|referr|initial|utm_/i.test(key)) delete event.properties[key];
        }
        event.properties.$current_url = "https://isitusa.com" + analyticsRoute(location.pathname);
        event.properties.$geoip_disable = true;
        event.properties.$ip = "0.0.0.0";
        event.properties.$process_person_profile = false;
        return event;
      },
      loaded: (instance: ReplayClient) => {
        client = instance;
        if (permitted && replayAllowed()) {
          instance.opt_in_capturing({ captureEventName: false });
          instance.startSessionRecording();
        } else stopReplay();
        resolve();
      },
    };
    // Minimal official snippet queue: no capture calls are queued before consent.
    const stub = Object.assign([], { _i: [[ANALYTICS_TOKEN, configuration, "posthog"]], __SV: 1, people: [] });
    (window as ReplayWindow).posthog = stub;
    const script = document.createElement("script");
    script.src = "https://us-assets.i.posthog.com/static/1.438.7/array.js";
    script.integrity = "sha384-yP0TgcBPX7RtVPhewYobtJnM6lTvCAB1nG7x58BO16+ARdSpaLFG39PpngN9a6QB";
    script.crossOrigin = "anonymous"; script.referrerPolicy = "no-referrer"; script.async = true;
    script.onerror = () => { script.remove(); loading = undefined; reject(new Error("Optional replay unavailable")); };
    document.head.appendChild(script);
  });
  await loading.catch(() => { /* Never interfere with browsing if blocked. */ });
}
