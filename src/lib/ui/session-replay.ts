import { abortOptionalRequests, installOptionalTransport } from "./capture-transport";
import { cleanHeatmap, type CaptureEvent } from "./heatmap-privacy";
import { maskReplayText } from "./replay-public-text";
import { ANALYTICS_TOKEN, analyticsChoice, analyticsRoute, replayChoice, heatmapChoice } from "./telemetry";

// Only public information pages. No atlas location searches, checkout, intake,
// subscriptions, authentication or team pages enter a recording.
export function replayRouteAllowed(path: string): boolean {
  return ["/about", "/brand"].includes(path);
}
function publicCaptureRouteAllowed(): boolean {
  return typeof window !== "undefined"
    && ["isitusa.com", "www.isitusa.com"].includes(location.hostname)
    && !location.search && !location.hash && replayRouteAllowed(location.pathname)
    && !document.querySelector("main form, main input, main textarea, main select, main [contenteditable], main iframe, main [data-private]");
}
export function replayAllowed():boolean {return publicCaptureRouteAllowed() && replayChoice();}
export function heatmapAllowed():boolean {return publicCaptureRouteAllowed() && heatmapChoice();}

type ReplayClient = {
  set_config(options:Record<string,unknown>):void;
  get_property?(name:string):unknown;
  on?(name:string,callback:(result:{ok?:boolean;config?:{heatmaps?:boolean}})=>void):unknown;
  startSessionRecording(): void;
  stopSessionRecording(): void;
  opt_in_capturing(options?: Record<string, unknown>): void;
  opt_out_capturing(options?: Record<string, unknown>): void;
};
type ReplayWindow = Window & { posthog?: ReplayClient | (unknown[] & { _i: unknown[]; __SV: number; people: unknown[] }) };
let client: ReplayClient | undefined;
let loading: Promise<void> | undefined;
let permitted = false, heatmapsPermitted = false, providerHeatmapsEnabled = false;

export function stopReplay() {
  permitted = false;
  abortOptionalRequests("replay");
  client?.stopSessionRecording();
  if(!heatmapsPermitted)client?.opt_out_capturing({ clear_persistence: true });
}
export function stopHeatmaps() {
  heatmapsPermitted=false;
  abortOptionalRequests("heatmaps");
  client?.set_config({enable_heatmaps:false,capture_heatmaps:false});
  if(!permitted)client?.opt_out_capturing({clear_persistence:true});
}
export function stopOptionalCapture(){
  permitted=false;heatmapsPermitted=false;
  abortOptionalRequests();
  client?.stopSessionRecording();
  client?.set_config({enable_heatmaps:false,capture_heatmaps:false});
  client?.opt_out_capturing({clear_persistence:true});
}
function applyCapture(instance:ReplayClient){
  permitted=permitted && replayAllowed();heatmapsPermitted=heatmapsPermitted && heatmapAllowed();
  if(!permitted && !heatmapsPermitted){stopOptionalCapture();return;}
  instance.opt_in_capturing({captureEventName:false});
  // The pinned SDK ignores undefined set_config values. Use an explicit boolean
  // only after its actual remote configuration admits heatmaps.
  const heatmapsActive=heatmapsPermitted && providerHeatmapsEnabled;
  instance.set_config({enable_heatmaps:heatmapsActive,capture_heatmaps:heatmapsActive});
  if(permitted)instance.startSessionRecording();else instance.stopSessionRecording();
}
export async function syncReplay() {
  permitted=replayAllowed();heatmapsPermitted=heatmapAllowed();
  if(!permitted && !heatmapsPermitted){stopOptionalCapture();return;}
  installOptionalTransport({aggregate:()=>analyticsChoice()==="yes",replay:()=>permitted && replayAllowed(),heatmaps:()=>heatmapsPermitted && providerHeatmapsEnabled && heatmapAllowed()});
  if(client){applyCapture(client);return;}
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const configuration = {
      api_host: "https://us.i.posthog.com", defaults: "2026-05-30",
      api_transport: "fetch", request_batching: false, disable_compression: true,
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      capture_exceptions: false, capture_performance: false,
      enable_recording_console_log: false, disable_session_recording: true,
      disable_surveys: true, enable_heatmaps: false, capture_heatmaps: false, person_profiles: "never",
      persistence: "memory", opt_out_capturing_by_default: true,
      ip: false, save_referrer: false, save_campaign_params: false,
      session_recording: {
        maskAllInputs: true, maskTextSelector: "*", maskTextFn: maskReplayText, maskAllElementAttributes: true,
        blockSelector: "form, input, textarea, select, iframe, img, video, audio, object, embed, [contenteditable], [data-private], [role=dialog]",
        recordCrossOriginIframes: false, recordCanvas: false,
        recordHeaders: false, recordBody: false, recordPerformance: false,
        maskCapturedNetworkRequestFn: (request: { name?: string }) => {
          // This callback also redacts replay's page-location metadata.
          if (request.name) request.name = "https://isitusa.com" + (analyticsRoute(location.pathname) || "/");
          return request;
        },
      },
      before_send: (event: CaptureEvent | null) => {
        if(!event)return null;
        if(event.event==="$$heatmap")return heatmapsPermitted && providerHeatmapsEnabled && heatmapAllowed()?cleanHeatmap(event,location.pathname,ANALYTICS_TOKEN):null;
        if(event.event!=="$snapshot" || !permitted || !replayAllowed())return null;
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
        providerHeatmapsEnabled=instance.get_property?.("$heatmaps_enabled_server_side")===true;
        // Public on() API, with the event and property verified in pinned1.438.7.
        instance.on?.("extensionsRemoteConfig", result=>{
          if(!result.ok || typeof result.config?.heatmaps!=="boolean")return;
          providerHeatmapsEnabled=result.config.heatmaps;
          applyCapture(instance);
        });
        applyCapture(instance);
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
