import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { listZipEntries, readZipEntry } from "./zip-tools";

const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), label: z.string().min(1), authority: z.string().min(1),
  purpose: z.literal("taxonomy-reference-only"), homepage: z.url(), downloadUrl: z.url(), termsUrl: z.url(), citationUrl: z.url(),
  adapter: z.object({ id: z.literal("taxonomy-reference-download"), version: z.literal("1.0.0"), module: z.literal("scripts/research/acquire-taxonomy-reference.ts") }).strict(),
  maximumArtifactBytes: z.number().int().positive().max(268435456), timeoutMs: z.number().int().positive().max(300000),
  redirects: z.literal("reject"), retryPolicy: z.string().min(1), licensing: z.string().min(1), limitations: z.array(z.string().min(1)).min(1),
}).strict();
export const taxonomyReferenceRegistrySchema = z.object({ schemaVersion: z.literal(1), sources: z.array(sourceSchema).min(1) }).strict();
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export function validateAcquisitionId(id: string) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id), "Acquisition identity must be a simple lowercase name.");
  return id;
}
export function validateZipEntryNames(entries: string[]) {
  assert(entries.length > 0 && entries.length <= 1000 && new Set(entries).size === entries.length, "Archive entry list is empty, excessive or duplicated.");
  for (const name of entries) assert(!name.startsWith("/") && !name.startsWith("\\") && !/^[A-Za-z]:/u.test(name)
    && !name.split(/[\\/]/u).includes("..") && !name.includes("\0"), "Unsafe archive entry name.");
}

/** A bounded transport primitive. It never treats an HTTP error or partial file as an acquired reference. */
export async function retainZipResponse(response: Response, destination: string, maximumBytes: number) {
  assert(response.status === 200 && !response.redirected, `Reference download requires direct HTTP 200, received ${response.status}.`);
  assert(response.body, "Reference response lacks a body.");
  const encoding = response.headers.get("content-encoding");
  assert(!encoding || encoding === "identity", "Encoded transport must be reviewed before preserving provider ZIP bytes.");
  const contentLength = response.headers.get("content-length");
  const declared = contentLength === null ? null : Number(contentLength);
  assert(declared === null || (/^[0-9]+$/u.test(contentLength!) && Number.isSafeInteger(declared) && declared > 0 && declared <= maximumBytes), "Invalid or excessive declared archive size.");
  const file = await open(destination, "wx");
  const reader = response.body.getReader();
  const digest = createHash("sha256"); let count = 0; let prefix = Buffer.alloc(0);
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      const bytes = Buffer.from(next.value); count += bytes.length;
      assert(count <= maximumBytes, "Reference archive exceeds its byte budget.");
      if (prefix.length < 4) prefix = Buffer.concat([prefix, bytes.subarray(0, 4 - prefix.length)]);
      digest.update(bytes);
      let written = 0;
      while (written < bytes.length) { const result = await file.write(bytes, written, bytes.length - written); assert(result.bytesWritten > 0, "Archive write made no progress."); written += result.bytesWritten; }
    }
    assert(count > 4 && (declared === null || count === declared), "Reference body is empty or differs from its declared size.");
    assert(prefix.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), "Response is not a ZIP archive.");
    await file.sync();
    return { bytes: count, sha256: digest.digest("hex"), declaredBytes: declared };
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); await file.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 4 && args[0] === "--source" && args[2] === "--acquisition-id", "Usage: --source <registered-id> --acquisition-id <unique-id>");
  const id = validateAcquisitionId(args[3]!); const root = process.cwd();
  const git = (...a: string[]) => execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...a], { encoding: "utf8" }).trim();
  assert(git("branch", "--show-current") === "main", "Taxonomy acquisition is MAIN-only.");
  assert(git("status", "--porcelain").length === 0, "Taxonomy reference acquisition requires a clean committed worktree.");
  const codeCommit = git("rev-parse", "HEAD");
  const registryPath = "src/data/research/taxonomy-reference-registry.json";
  const registryBytes = readFileSync(registryPath); const registry = taxonomyReferenceRegistrySchema.parse(readJson(registryPath));
  assert(new Set(registry.sources.map(s => s.id)).size === registry.sources.length, "Reference source IDs repeat.");
  const source = registry.sources.find(s => s.id === args[1]); assert(source, "Unregistered taxonomy reference.");
  assert(new URL(source.downloadUrl).protocol === "https:", "Reference acquisition requires HTTPS.");
  const policy = readJson("ops/national-research/resource-policy.json") as { maximumNationalAcquisitionArtifactBytes: number };
  assert(source.maximumArtifactBytes <= policy.maximumNationalAcquisitionArtifactBytes, "Reference exceeds project acquisition policy.");
  const relativeDirectory = `src/data/research/taxonomy-references/${id}`; const directory = path.resolve(root, relativeDirectory);
  assert(directory.startsWith(root + path.sep) && !existsSync(directory), "Acquisition path is outside repository or already exists.");
  let parent = path.dirname(directory);
  while (parent.startsWith(root + path.sep)) { if (existsSync(parent)) assert(!lstatSync(parent).isSymbolicLink(), "Reference parent is a symbolic link."); parent = path.dirname(parent); }
  mkdirSync(directory, { recursive: true });
  const startedAt = new Date().toISOString(); const started = performance.now();
  const receipt = {
    schemaVersion: 1, kind: "isitusa-taxonomy-reference-acquisition", acquisitionId: id, sourceId: source.id,
    adapter: source.adapter, codeCommit, registry: { path: registryPath, bytes: registryBytes.length, sha256: hash(registryBytes) },
    parameters: { url: source.downloadUrl, maximumBytes: source.maximumArtifactBytes, timeoutMs: source.timeoutMs, redirects: source.redirects },
    startedAt, completedAt: "", elapsedMilliseconds: 0, status: "incomplete", requestCount: 0,
    request: null as null | { url: string; status: number; retrievedAt: string; contentType: string | null; etag: string | null; lastModified: string | null },
    artifacts: [] as Array<{ path: string; bytes: number; sha256: string; mediaType: string }>, entries: [] as string[],
    licensingReview: "pending review of retained release metadata; no acceptance pathway activated",
    evidenceAssertions: 0, countyDeterminations: 0, reviewActor: { type: "agent", id: "MAIN" }, error: null as string | null,
  };
  try {
    receipt.requestCount = 1;
    const response = await fetch(source.downloadUrl, { redirect: "manual", signal: AbortSignal.timeout(source.timeoutMs),
      headers: { Accept: "application/zip, application/octet-stream", "Accept-Encoding": "identity", "User-Agent": "Project-Isitusa/taxonomy-reference-review" } });
    receipt.request = { url: source.downloadUrl, status: response.status, retrievedAt: new Date().toISOString(), contentType: response.headers.get("content-type"), etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") };
    const temporary = path.join(directory, "archive.partial"); const artifact = await retainZipResponse(response, temporary, source.maximumArtifactBytes);
    const entries = listZipEntries(temporary); validateZipEntryNames(entries); receipt.entries = entries;
    const metadataNames = entries.filter(name => /(?:^|\/)(?:(?:wcvp[_ -])?readme[^/]*|eml\.xml|meta\.xml|licen[cs]e[^/]*|citation[^/]*)$/iu.test(name));
    assert(metadataNames.length > 0 && metadataNames.length <= 10, "Reference archive contains no readable release metadata.");
    const metadata = metadataNames.map(name => ({ name, bytes: readZipEntry(temporary, name, 2 * 1024 * 1024) }));
    assert(git("rev-parse", "HEAD") === codeCommit, "MAIN changed during acquisition.");
    renameSync(temporary, path.join(directory, "archive.zip"));
    receipt.artifacts.push({ path: `${relativeDirectory}/archive.zip`, bytes: artifact.bytes, sha256: artifact.sha256, mediaType: "application/zip" });
    for (let i = 0; i < metadata.length; i++) {
      const file = metadata[i]!; const filename = `metadata-${i + 1}.raw`;
      writeFileSync(path.join(directory, filename), file.bytes, { flag: "wx" });
      receipt.artifacts.push({ path: `${relativeDirectory}/${filename}`, bytes: file.bytes.length, sha256: hash(file.bytes), mediaType: "application/octet-stream" });
    }
    writeFileSync(path.join(directory, "metadata-index.json"), JSON.stringify(metadata.map((file, i) => ({ archiveEntry: file.name, path: `${relativeDirectory}/metadata-${i + 1}.raw` })), null, 2) + "\n", { flag: "wx" });
    const indexBytes = readFileSync(path.join(directory, "metadata-index.json")); receipt.artifacts.push({ path: `${relativeDirectory}/metadata-index.json`, bytes: indexBytes.length, sha256: hash(indexBytes), mediaType: "application/json" });
    receipt.status = "complete-reference-capture-awaiting-method-review";
  } catch (error) { receipt.status = "failed"; receipt.error = error instanceof Error ? error.message : String(error); process.exitCode = 1; }
  finally {
    receipt.completedAt = new Date().toISOString(); receipt.elapsedMilliseconds = Math.round(performance.now() - started);
    writeFileSync(path.join(directory, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify(receipt, null, 2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
