import assets from "@/data/runtime/data-assets.json";

type Bundle = keyof typeof assets.bundles;
type Asset = { url: string; sha256: string; bytes: number };
type Request = typeof fetch;

// One request per version and browser session. Failed requests are evicted so retry works.
export function createRuntimeDataLoader(request: Request = fetch, timeoutMs = 20000) {
  const pending = new Map<string, Promise<unknown>>();
  const failed = new Set<string>();
  return function load<T>(asset: Asset): Promise<T> {
    if (!/^https:\/\/data\.isitusa\.com\/app-data\/sha256\/[a-f0-9]{64}\.json$/.test(asset.url)
      || !asset.url.endsWith(`/${asset.sha256}.json`) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1) {
      return Promise.reject(new Error("Invalid versioned dataset declaration."));
    }
    let promise = pending.get(asset.url);
    if (!promise) {
      promise = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await request(asset.url, { cache: failed.has(asset.url) ? "reload" : "force-cache", signal: controller.signal, credentials: "omit" });
          if (!response.ok) throw new Error(`Dataset request failed (${response.status}).`);
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength !== asset.bytes) throw new Error("Dataset byte count differs from the release declaration.");
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
          if (hash !== asset.sha256) throw new Error("Dataset hash differs from the release declaration.");
          return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        } finally {
          clearTimeout(timer);
        }
      })().catch(error => {
        pending.delete(asset.url);
        failed.add(asset.url);
        throw error;
      });
      pending.set(asset.url, promise);
    }
    return promise as Promise<T>;
  };
}
const load = createRuntimeDataLoader();
export function loadRuntimeData<T>(bundle: Bundle): Promise<T> {
  return load<T>(assets.bundles[bundle]);
}
