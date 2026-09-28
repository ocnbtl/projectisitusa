import snapshotConfiguration from "@/data/research/application-research-snapshot.json";

type Request = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export interface ApplicationResearchConfiguration {
  schemaVersion: number;
  sourceCommit: string;
  asOf: string;
  basePath: string;
  manifestSha256: string;
  manifestBytes: number;
}
interface Artifact {
  path: string;
  sha256: string;
  bytes: number;
  storedSha256: string;
  storedBytes: number;
}
interface Manifest {
  schemaVersion: number;
  kind: string;
  sourceCommit: string;
  asOf: string;
  files: Record<string, Artifact>;
}
const SHA = /^[0-9a-f]{64}$/u;
const RELATIVE = /^(?:[A-Z]{2}\/(?:summary|counties\/\d{5})|map-index)\.json$/u;
const MAX_DECODED_BYTES = 40_000_000;
const MAX_STORED_BYTES = 4_000_000;

async function boundedBytes(stream: ReadableStream<Uint8Array> | null, limit: number, signal?: AbortSignal | null) {
  if (!stream) throw new Error("Research snapshot response has no body.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw new Error("Research snapshot exceeds its declared byte limit.");
      chunks.push(next.value);
    }
    signal?.throwIfAborted();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
async function verify(bytes: Uint8Array, expectedHash: string, expectedBytes: number) {
  if (bytes.byteLength !== expectedBytes) throw new Error("Research snapshot byte count differs from its declaration.");
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expectedHash) throw new Error("Research snapshot hash differs from its declaration.");
}
function parse(bytes: Uint8Array) { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }

export function createApplicationResearchFetcher(config: ApplicationResearchConfiguration, request: Request = fetch) {
  if (config.schemaVersion !== 1 || !/^[0-9a-f]{40}$/u.test(config.sourceCommit) ||
      config.basePath !== "/research-snapshots/" + config.sourceCommit ||
      !SHA.test(config.manifestSha256) || !Number.isSafeInteger(config.manifestBytes) ||
      config.manifestBytes < 1 || config.manifestBytes > 2_000_000 ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(config.asOf)) {
    throw new Error("Invalid application research snapshot configuration.");
  }
  let manifestPromise: Promise<Manifest> | null = null;
  const failedUrls = new Set<string>();
  async function discover() {
    const url = config.basePath + "/manifest.json";
    try {
    const signal = AbortSignal.timeout(15000);
    const response = await request(url, { cache: failedUrls.has(url) ? "reload" : "force-cache", signal });
    if (!response.ok) throw new Error("Research manifest request failed: " + response.status);
    const bytes = await boundedBytes(response.body, config.manifestBytes, signal);
    await verify(bytes, config.manifestSha256, config.manifestBytes);
    const manifest = parse(bytes) as Manifest;
    if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== "isitusa-application-research-snapshot" ||
        manifest.sourceCommit !== config.sourceCommit || manifest.asOf !== config.asOf ||
        !manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files)) {
      throw new Error("Research manifest identity differs from this application release.");
    }
    for (const [logical, entry] of Object.entries(manifest.files)) {
      if (!RELATIVE.test(logical) || !entry || entry.path !== logical + ".gz" ||
          !SHA.test(entry.sha256) || !SHA.test(entry.storedSha256) ||
          !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > MAX_DECODED_BYTES ||
          !Number.isSafeInteger(entry.storedBytes) || entry.storedBytes < 1 || entry.storedBytes > MAX_STORED_BYTES) {
        throw new Error("Invalid research snapshot artifact declaration.");
      }
    }
    failedUrls.delete(url);
    return manifest;
    } catch (error) { failedUrls.add(url); throw error; }
  }
  function getManifest() {
    if (!manifestPromise) manifestPromise = discover().catch(error => { manifestPromise = null; throw error; });
    return manifestPromise;
  }
  return async function fetchProjection(relative: string, init: RequestInit = {}): Promise<unknown> {
    if (!RELATIVE.test(relative)) throw new Error("Unsafe application research path.");
    init.signal?.throwIfAborted();
    const manifest = await getManifest();
    init.signal?.throwIfAborted();
    const entry = manifest.files[relative];
    if (!entry) throw new Error("This research snapshot does not include " + relative);
    const timeout = AbortSignal.timeout(20000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const url = config.basePath + "/" + entry.path;
    try {
    const response = await request(url, { ...init, signal, cache: failedUrls.has(url) ? "reload" : "force-cache" });
    if (!response.ok) throw new Error("Research snapshot request failed: " + response.status);
    const packed = await boundedBytes(response.body, entry.storedBytes, signal);
    await verify(packed, entry.storedSha256, entry.storedBytes);
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed research data. Please update your browser.");
    const decodedStream = new Blob([new Uint8Array(packed).buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    const bytes = await boundedBytes(decodedStream, entry.bytes, signal);
    await verify(bytes, entry.sha256, entry.bytes);
    signal.throwIfAborted();
    const value = parse(bytes);
    failedUrls.delete(url);
    return value;
    } catch (error) { failedUrls.add(url); throw error; }
  };
}

export const applicationResearchSnapshot: ApplicationResearchConfiguration = snapshotConfiguration;
export const fetchApplicationResearchJson = createApplicationResearchFetcher(applicationResearchSnapshot);
