import { env, HttpError } from "./runtime.ts";
// Fixed aggregate queries only: callers cannot supply SQL, dates, project IDs or properties.
// The server-only key must be restricted to project 644720 and query/read access.
const WHERE = "properties.environment = 'production' AND toString(properties.schema_version) = '1'";
const QUERIES = {
  summary: `SELECT uniqIf(distinct_id, event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY) AS monthly, uniqIf(distinct_id, event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY) AS weekly, uniqIf(distinct_id, event IN ('$pageview','site_active') AND timestamp >= now() - INTERVAL 5 MINUTE) AS active, countIf(event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY) AS pageviews FROM events WHERE timestamp >= now() - INTERVAL 30 DAY AND ${WHERE}`,
  daily: `SELECT toDate(timestamp) AS day, uniq(distinct_id) AS visitors, count() AS pageviews FROM events WHERE timestamp >= now() - INTERVAL 30 DAY AND event = '$pageview' AND ${WHERE} GROUP BY day ORDER BY day LIMIT 31`,
  pages: `SELECT properties.$pathname AS page, uniq(distinct_id) AS visitors, count() AS pageviews FROM events WHERE timestamp >= now() - INTERVAL 30 DAY AND event = '$pageview' AND ${WHERE} GROUP BY page ORDER BY pageviews DESC LIMIT 15`,
  actions: `SELECT event AS action, count() AS uses FROM events WHERE timestamp >= now() - INTERVAL 30 DAY AND event IN ('county_selected','map_filter_changed','zip_search_completed','species_search_completed','species_opened','directory_view_changed','evidence_opened','source_opened','county_card_downloaded','signup_requested','signup_request_accepted','signup_request_failed','sighting_started','sighting_submitted','sighting_failed','contribution_method_selected','checkout_started','checkout_opened','checkout_failed','crypto_address_copied') AND ${WHERE} GROUP BY action ORDER BY uses DESC LIMIT 20`,
} as const;
type Snapshot = { checkedAt: string; summary: unknown[][]; daily: unknown[][]; pages: unknown[][]; actions: unknown[][] };
let cached: Snapshot | null = null;
let pending: Promise<Snapshot> | null = null;
export async function analyticsSnapshot(): Promise<Snapshot> {
  if (cached && Date.now() - Date.parse(cached.checkedAt) < 300000) return cached;
  if (pending) return pending;
  pending = (async () => {
    const result = { checkedAt: new Date().toISOString() } as Snapshot;
    // One deadline across all queries stays below the client's 30-second timeout.
    const signal = AbortSignal.timeout(20000);
    for (const [name, query] of Object.entries(QUERIES)) {
      const response = await fetch("https://us.posthog.com/api/projects/644720/query/", {
        method: "POST", headers: { Authorization: `Bearer ${env("POSTHOG_READ_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query } }), signal,
      });
      if (!response.ok) throw new HttpError(503, "Site analytics could not refresh. Try again in a few minutes.");
      const data = await response.json();
      if (!Array.isArray(data.results) || data.results.length > 31 || data.results.some((row: unknown) => !Array.isArray(row) || row.length > 4)) throw new HttpError(503, "Site analytics returned an unexpected response.");
      result[name as keyof typeof QUERIES] = data.results;
    }
    cached = result; return result;
  })();
  try { return await pending; } finally { pending = null; }
}
