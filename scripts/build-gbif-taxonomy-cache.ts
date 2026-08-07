import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

type JsonRecord = Record<string, any>;

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function argumentsByName(args: string[]) {
  const values = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    const name = key.slice(2);
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  return values;
}

function required(values: Map<string, string[]>, name: string) {
  const value = values.get(name)?.at(-1);
  assert(value, `--${name} is required.`);
  return value;
}

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as JsonRecord;
}

function speciesMatchUrl(scientificName: string) {
  const url = new URL("https://api.gbif.org/v1/species/match");
  url.searchParams.set("name", scientificName);
  url.searchParams.set("rank", "SPECIES");
  url.searchParams.set("strict", "true");
  return url.toString();
}

const values = argumentsByName(process.argv.slice(2));
const output = path.resolve(required(values, "output"));
const cacheId = required(values, "cache-id");
const createdAt = new Date(required(values, "created-at")).toISOString();
const candidateFiles = values.get("candidate-file") ?? [];
assert(candidateFiles.length > 0, "At least one --candidate-file is required.");
assert(output.startsWith(`${root}${path.sep}`), "The taxonomy cache output must remain in the repository.");

const speciesById = new Map(
  (readJson(path.join(root, "src/data/generated/species.json")) as JsonRecord[]).map((entry) => [
    String(entry.id),
    String(entry.scientificName),
  ]),
);
const requestedSpecies = [...new Set(candidateFiles.flatMap((candidateFile) => {
  const candidate = readJson(path.resolve(root, candidateFile));
  assert(candidate.stateCode && Array.isArray(candidate.candidates), `Invalid candidate file ${candidateFile}.`);
  return candidate.candidates.map((entry: JsonRecord) => String(entry.speciesId));
}))].sort();
const selected = new Map<string, JsonRecord>();
const runRoot = path.join(root, "src/data/research/runs");

for (const runId of readdirSync(runRoot).sort()) {
  const directory = path.join(runRoot, runId);
  const receiptPath = path.join(directory, "receipt.json");
  const verificationPath = path.join(directory, "source-verification.json");
  if (!existsSync(receiptPath) || !existsSync(verificationPath)) continue;
  const receipt = readJson(receiptPath);
  if (
    receipt.source_id !== "gbif-preserved-specimens" ||
    receipt.adapter_version !== "1.3.1" ||
    receipt.status !== "complete"
  ) continue;
  const verificationBytes = readFileSync(verificationPath);
  const verificationReference = (receipt.outputs as JsonRecord[]).find(
    (reference) => path.posix.basename(String(reference.path)) === "source-verification.json",
  );
  assert(verificationReference, `Run ${runId} lacks a source-verification reference.`);
  assert(
    verificationReference.bytes === verificationBytes.length &&
      verificationReference.sha256 === sha256(verificationBytes),
    `Run ${runId} source verification changed.`,
  );
  const verification = JSON.parse(verificationBytes.toString("utf8")) as JsonRecord;
  assert(
    verification.runId === runId &&
      verification.sourceId === receipt.source_id &&
      verification.parameterHash === receipt.parameter_hash,
    `Run ${runId} source verification identity changed.`,
  );
  for (const request of verification.acquisition?.requests ?? []) {
    const group = String(request.requestGroupId ?? "");
    if (!group.startsWith("species-match-")) continue;
    const speciesId = group.slice("species-match-".length);
    if (!requestedSpecies.includes(speciesId) || request.status !== 200) continue;
    const scientificName = speciesById.get(speciesId);
    assert(scientificName, `Unknown species ${speciesId}.`);
    const expectedUrl = speciesMatchUrl(scientificName);
    if (request.url !== expectedUrl) continue;
    const reference = (receipt.artifacts as JsonRecord[]).find((artifact) => {
      const filename = path.posix.basename(String(artifact.path));
      return filename === `gbif-species-match-${speciesId}.json.gz` || filename === `gbif-species-match-${speciesId}.json`;
    });
    assert(reference, `Run ${runId} lacks the taxonomy artifact for ${speciesId}.`);
    const artifactPath = path.join(root, String(reference.path));
    const artifactBytes = readFileSync(artifactPath);
    assert(
      reference.bytes === artifactBytes.length && reference.sha256 === sha256(artifactBytes),
      `Run ${runId} taxonomy artifact changed for ${speciesId}.`,
    );
    const body = String(reference.path).endsWith(".gz") ? gunzipSync(artifactBytes) : artifactBytes;
    JSON.parse(body.toString("utf8"));
    const candidate = {
      speciesId,
      scientificName,
      requestUrl: expectedUrl,
      status: 200,
      retrievedAt: String(request.retrievedAt),
      responseBodyBase64: body.toString("base64"),
      responseBodySha256: sha256(body),
      provenance: {
        runId,
        codeCommit: String(receipt.code_commit),
        adapterVersion: String(receipt.adapter_version),
        sourceVerificationPath: path.relative(root, verificationPath).split(path.sep).join("/"),
        sourceVerificationSha256: sha256(verificationBytes),
        artifactPath: String(reference.path),
        artifactSha256: String(reference.sha256),
        artifactBytes: Number(reference.bytes),
      },
    };
    const previous = selected.get(speciesId);
    if (!previous || Date.parse(candidate.retrievedAt) > Date.parse(String(previous.retrievedAt))) {
      selected.set(speciesId, candidate);
    }
  }
}

const missing = requestedSpecies.filter((speciesId) => !selected.has(speciesId));
const cache = {
  schemaVersion: 1,
  cacheId,
  createdAt,
  sourceId: "gbif-preserved-specimens",
  compatibleAdapterVersions: ["1.3.1"],
  missingSpecies: missing,
  entries: requestedSpecies.flatMap((speciesId) => {
    const entry = selected.get(speciesId);
    return entry ? [entry] : [];
  }),
};
const serialized = `${JSON.stringify(cache, null, 2)}\n`;
writeFileSync(output, serialized);
process.stdout.write(`${JSON.stringify({
  output: path.relative(root, output).split(path.sep).join("/"),
  cacheId,
  species: requestedSpecies.length,
  bytes: Buffer.byteLength(serialized),
  sha256: sha256(serialized),
  sourceRuns: new Set(cache.entries.map((entry) => entry?.provenance.runId)).size,
  missingSpecies: missing,
}, null, 2)}\n`);
