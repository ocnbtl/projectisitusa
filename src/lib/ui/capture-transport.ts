// The optional SDK gets a best-effort, one-shot transport. Failed telemetry is
// intentionally discarded, never retried after a later privacy withdrawal.
type Kind = "replay" | "heatmaps";
type Gates = Record<Kind, () => boolean> & {token?:string; aggregate?: () => boolean; aggregateEvents?:readonly string[]};
const active = new Map<AbortController, Kind>();
let installed = false;
let gates: Gates;
export function abortOptionalRequests(kind?: Kind) {
  for (const [controller, feature] of active) {
    if (!kind || feature === kind) { controller.abort(); active.delete(controller); }
  }
}
const acknowledge = () => new Response('{"status":1}', {status:200, headers:{"Content-Type":"application/json"}});
function vendor(url: string) {
  try { const parsed=new URL(url, location.href); return parsed.origin === "https://us.i.posthog.com"; }
  catch { return false; }
}
async function textBody(body: BodyInit | null | undefined): Promise<string> {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob) return body.text();
  return "";
}
export function installOptionalTransport(checks: Gates) {
  gates = checks;
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!vendor(url) || method !== "POST") return original(input, init);
    // The site's existing hand-written aggregate sender is separate from the SDK.
    // It validates its own closed event/property schema and current site choice.
    let raw: unknown;
    try {
      const body = await textBody(init?.body);
      try { raw=JSON.parse(body); }
      catch {
        const encoded=new URLSearchParams(body).get("data");
        if (!encoded) return acknowledge();
        try {raw=JSON.parse(encoded);} catch {raw=JSON.parse(atob(encoded));}
      }
    } catch { return acknowledge(); }
    // Pinned SDK1.438.7 uses {api_key,batch,sent_at} for timestamp-mode batch.
    // Classify its events, never mistake the public ingestion key for a feature.
    if (raw && typeof raw === "object" && "api_key" in raw && !("batch" in raw)) {
      const record=raw as Record<string,unknown>;
      const aggregate=Object.keys(record).sort().join(",")==="api_key,distinct_id,event,properties,timestamp"
        && record.api_key===gates.token && typeof record.event==="string"
        && gates.aggregateEvents?.includes(record.event);
      return aggregate && gates.aggregate?.() && new URL(url,location.href).pathname === "/i/v0/e/"
        ? original(input,init) : acknowledge();
    }
    let payload=raw;
    if (raw && typeof raw === "object" && "batch" in raw) {
      const envelope=raw as Record<string,unknown>;
      if (Object.keys(envelope).sort().join(",")!=="api_key,batch,sent_at" || envelope.api_key!==gates.token || !Array.isArray(envelope.batch)) return acknowledge();
      payload=envelope.batch;
    }
    const events = Array.isArray(payload) ? payload : [payload];
    if (!events.length || events.length > 100) return acknowledge();
    let kind: Kind | undefined;
    for (const event of events) {
      if (!event || typeof event !== "object" || !event.properties || typeof event.properties !== "object") return acknowledge();
      const next = event.event === "$snapshot" ? "replay" : event.event === "$$heatmap" ? "heatmaps" : undefined;
      if (!next || (kind && kind !== next) || !gates[next]()) return acknowledge();
      kind=next;
    }
    if (!kind || !gates[kind]()) return acknowledge();
    const controller=new AbortController();
    active.set(controller,kind);
    const prior=init?.signal || (input instanceof Request ? input.signal : undefined);
    const cancel=()=>controller.abort();
    if (prior?.aborted) controller.abort();
    else prior?.addEventListener("abort",cancel,{once:true});
    const timeout=setTimeout(()=>controller.abort(),10000);
    try {
      // No keepalive: pagehide cancels instead of leaking a queued unload send.
      await original(input,{...init,signal:controller.signal,keepalive:false});
    } catch { /* Network failure and withdrawal both discard optional data. */ }
    finally {clearTimeout(timeout);active.delete(controller);prior?.removeEventListener("abort",cancel);}
    // Local acknowledgement suppresses the SDK retry queue, not a delivery claim.
    return acknowledge();
  };
  // The SDK may prefer beacon at pagehide. Never permit an unabortable SDK send.
  if (typeof navigator.sendBeacon === "function") {
    const beacon=navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon=(url,data)=>vendor(String(url)) ? true : beacon(url,data);
  }
}
