import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import type { ImmutableResearchRunReceipt, ResearchPairOutcome } from "@/lib/research/types";
import { sha256, stableJson } from "@/lib/research/run-files";
import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import type { GbifArchivedReplay } from "./gbif-archived-replay";
import { INATURALIST_GBIF_DATASET_KEY, type GbifOccurrenceRecord } from "./adapters/inaturalist-gbif-research-grade";

type Reference = { path: string; bytes: number; sha256: string };
type ResponsePage = { offset: number; limit: number; count: number; endOfRecords: boolean; results: GbifOccurrenceRecord[] };
export type InaturalistArchivedReplay = GbifArchivedReplay & {
  originalRetrievalByRecordId: ReadonlyMap<string, { retrievedAt: string; rowSha256: string; artifactPath: string }>;
  provenance: Record<string, unknown>;
};
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

/** Replay committed provider responses, without inventing legacy worker verification files. */
export function loadInaturalistArchivedReplay(input: {
  repositoryRoot: string; archiveCommit: string; archiveRunId: string; stateCode: string;
  requestedPairKeys: string[]; expectedSpecies: Array<{ speciesId: string; scientificName: string }>;
  requestedParameters: Record<string, unknown>;
}): InaturalistArchivedReplay {
  assert(/^[a-f0-9]{40}$/u.test(input.archiveCommit), "iNaturalist replay requires a full Git SHA.");
  assert(/^[0-9]{8}T[0-9]{6}Z__inaturalist-research-grade__[a-f0-9]{12}$/u.test(input.archiveRunId), "Unsafe or unsupported iNaturalist replay run ID.");
  const root = `src/data/research/runs/${input.archiveRunId}`;
  function read(relativePath: string) {
    assert(relativePath.startsWith(root + "/") && !relativePath.split(/[\\/]/u).includes("..") && !relativePath.includes(":"), "Replay reference escapes its committed run.");
    return execFileSync("git", ["-c", `safe.directory=${input.repositoryRoot}`, "-c", "core.longpaths=true", "-C", input.repositoryRoot, "show", `${input.archiveCommit}:${relativePath}`], { maxBuffer: 64 * 1024 * 1024 });
  }
  function verify(reference: Reference) {
    assert(Number.isSafeInteger(reference.bytes) && reference.bytes >= 0 && reference.bytes <= 64 * 1024 * 1024 && /^[a-f0-9]{64}$/u.test(reference.sha256), "Invalid replay reference descriptor.");
    const bytes = read(reference.path);
    assert(bytes.length === reference.bytes && sha256(bytes) === reference.sha256, `Retained iNaturalist reference changed: ${reference.path}.`);
    return bytes;
  }
  const receiptBytes = read(root + "/receipt.json");
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as ImmutableResearchRunReceipt;
  assert(receipt.run_id === input.archiveRunId && receipt.source_id === "inaturalist-research-grade" && receipt.adapter_id === "inaturalist-gbif-research-grade" && receipt.adapter_version === "1.0.0", "Replay requires the original registered iNaturalist v1.0.0 receipt.");
  assert(receipt.status === "complete" || receipt.status === "partial", "Failed original receipts cannot be replayed.");
  assert(receipt.requested_scope.state_code === input.stateCode && receipt.parameters.stateCode === input.stateCode, "Replay state mismatch.");
  assert(sha256(stableJson(receipt.parameters)) === receipt.parameter_hash, "Replay parameter hash mismatch.");
  assert(receipt.parameters.datasetKey === INATURALIST_GBIF_DATASET_KEY, "Replay dataset mismatch.");
  for (const key of ["stateCode", "stateProvince", "datasetKey", "basisOfRecord", "occurrenceStatus", "expectedCrawlId", "expectedLastParsed", "pageLimit"]) {
    assert(stableJson(receipt.parameters[key]) === stableJson(input.requestedParameters[key]), `Replay changed the retained query/snapshot parameter ${key}.`);
  }
  assert(Array.isArray(input.requestedParameters.allowedLicenses) && input.requestedParameters.allowedLicenses.length > 0 && input.requestedParameters.allowedLicenses.every(license => (receipt.parameters.allowedLicenses as string[]).includes(license)), "Replay cannot widen the original license scope.");
  const verifiedOutputs = new Map(receipt.outputs.map(ref => [ref.path.slice(root.length + 1), verify(ref)]));
  assert(verifiedOutputs.size === receipt.outputs.length, "Duplicate original output references.");
  const outcomeBytes = verifiedOutputs.get("outcomes.ndjson");
  assert(outcomeBytes, "Retained replay lacks outcomes.");
  const outcomes = outcomeBytes.toString("utf8").split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line) as ResearchPairOutcome);
  const requestedPairs = [...new Set(input.requestedPairKeys)].sort();
  assert(requestedPairs.length > 0 && requestedPairs.length === input.requestedPairKeys.length, "Replay requires unique nonempty pairs.");
  for (const pair of requestedPairs) {
    const matches = outcomes.filter(outcome => `${outcome.county_fips}:${outcome.species_id}` === pair);
    assert(receipt.requested_scope.pair_keys.includes(pair) && matches.length === 1 && matches[0].scope_complete, `Replay pair lacks exactly one complete original outcome: ${pair}.`);
  }
  const speciesIds = [...new Set(requestedPairs.map(pair => pair.slice(pair.indexOf(":") + 1)))].sort();
  assert(stableJson(speciesIds) === stableJson(input.expectedSpecies.map(species => species.speciesId).sort()), "Replay species definitions do not equal its requested scope.");
  const artifacts = new Map(receipt.artifacts.map(ref => [ref.path.slice(root.length + 11), ref]));
  assert(artifacts.size === receipt.artifacts.length, "Duplicate retained artifact names.");
  const responseByUrl = new Map<string, Buffer>();
  const originalRetrievalByRecordId = new Map<string, { retrievedAt: string; rowSha256: string; artifactPath: string }>();
  const selectedResponses: Array<Record<string, unknown>> = [];
  let retainedBytes = 0;
  function retain(url: string, filename: string, expectedCount: (payload: unknown) => number) {
    const request = receipt.upstream_requests.filter(entry => entry.url === url);
    assert(request.length === 1 && request[0].status === 200 && Number.isFinite(Date.parse(request[0].retrieved_at)), `Missing or ambiguous successful original request: ${url}.`);
    const ref = artifacts.get(filename);
    assert(ref, `Missing original artifact ${filename}.`);
    retainedBytes += ref.bytes;
    assert(retainedBytes <= 64 * 1024 * 1024, "Replay exceeds the retained response budget.");
    const compressed = verify(ref);
    const bytes = gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 });
    const payload: unknown = JSON.parse(bytes.toString("utf8"));
    assert(expectedCount(payload) === request[0].record_count, `Retained response count differs from its receipt: ${filename}.`);
    assert(!responseByUrl.has(url), "Duplicate selected replay request.");
    responseByUrl.set(url, bytes);
    selectedResponses.push({ url, status: 200, originalRetrievedAt: request[0].retrieved_at, recordCount: request[0].record_count, artifact: ref, decodedSha256: sha256(bytes), decodedBytes: bytes.length });
    return { payload, retrievedAt: request[0].retrieved_at, ref };
  }
  for (const species of input.expectedSpecies) {
    assert(/^[a-z0-9-]+$/u.test(species.speciesId), "Unsafe replay species ID.");
    const matchUrl = new URL("https://api.gbif.org/v1/species/match");
    matchUrl.search = new URLSearchParams({ name: species.scientificName, rank: "SPECIES", strict: "true" }).toString();
    const matched = retain(matchUrl.href, `gbif-species-match-${species.speciesId}.json.gz`, () => 1).payload as { speciesKey?: number; acceptedUsageKey?: number; usageKey?: number };
    const taxonKey = matched.speciesKey ?? matched.acceptedUsageKey ?? matched.usageKey;
    assert(Number.isInteger(taxonKey), "Retained taxonomy response lacks an executable species key.");
    let offset = 0, total: number | null = null, seen = 0;
    while (true) {
      assert(offset < 100000, "Retained replay exceeds the search result window.");
      const url = new URL("https://api.gbif.org/v1/occurrence/search");
      url.search = new URLSearchParams({ country: "US", stateProvince: String(receipt.parameters.stateProvince), basisOfRecord: "HUMAN_OBSERVATION", occurrenceStatus: "PRESENT", datasetKey: INATURALIST_GBIF_DATASET_KEY, hasCoordinate: "true", hasGeospatialIssue: "false", taxonKey: String(taxonKey), limit: String(receipt.parameters.pageLimit), offset: String(offset) }).toString();
      const retained = retain(url.href, `gbif-occurrences-${species.speciesId}-${String(offset).padStart(6, "0")}.json.gz`, payload => Array.isArray((payload as ResponsePage)?.results) ? (payload as ResponsePage).results.length : -1);
      const page = retained.payload as ResponsePage;
      assert(page.offset === offset && page.limit === receipt.parameters.pageLimit && Number.isSafeInteger(page.count) && page.count >= 0 && typeof page.endOfRecords === "boolean", "Malformed retained pagination.");
      if (total === null) total = page.count;
      assert(total === page.count, "Retained result count changed between pages.");
      seen += page.results.length;
      for (const record of page.results) {
        const id = Number.isInteger(record.key) ? String(record.key) : record.gbifID;
        if (!id) continue;
        const rowSha256 = sha256(JSON.stringify(record));
        const old = originalRetrievalByRecordId.get(id);
        assert(!old || old.rowSha256 === rowSha256, `Conflicting retained rows for GBIF key ${id}.`);
        if (!old) originalRetrievalByRecordId.set(id, { retrievedAt: retained.retrievedAt, rowSha256, artifactPath: retained.ref.path });
      }
      if (page.endOfRecords) { assert(seen === total, "Retained final page does not cover the declared total."); break; }
      assert(page.results.length === page.limit && seen < total, "Retained pagination has a gap or inconsistent ending.");
      offset += page.limit;
    }
  }
  const consumed = new Set<string>();
  const replay: InaturalistArchivedReplay = {
    archiveCommit: input.archiveCommit, archiveRunId: input.archiveRunId, archiveReceiptStatus: receipt.status,
    requestedPairCount: requestedPairs.length, requestUrls: [...responseByUrl.keys()],
    get reusedArtifactCount() { return consumed.size; }, get preventedProviderRequestCount() { return consumed.size; },
    originalRetrievalByRecordId,
    provenance: { schemaVersion: 1, kind: "isitusa-inaturalist-retained-response-replay", archiveCommit: input.archiveCommit, receipt: { path: root + "/receipt.json", sha256: sha256(receiptBytes), bytes: receiptBytes.length }, originalCodeCommit: receipt.code_commit, originalAdapterVersion: receipt.adapter_version, originalParameterHash: receipt.parameter_hash, requestedPairs, selectedResponses, rawRowHashEncoding: "SHA256 of JSON.stringify of the original parsed provider row", interpretation: "Hashes, successful original requests, complete pagination, exact requested scope and original outcomes verified directly. No historical worker source-verification companion is fabricated. This is retained evidence replay, not a fresh provider acquisition; completed source scope is not biological absence." },
    fetch: (async (resource, init) => {
      assert((init?.method ?? (resource instanceof Request ? resource.method : "GET")).toUpperCase() === "GET", "Retained replay permits GET only.");
      const url = resource instanceof Request ? resource.url : String(resource);
      const bytes = responseByUrl.get(url); assert(bytes, `Unretained request blocked: ${url}.`);
      consumed.add(url); return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  };
  return replay;
}

export function applyInaturalistReplayProvenance(result: SourceAdapterResult, replay: InaturalistArchivedReplay) {
  result.artifacts.push({ filename: "inaturalist-retained-replay-provenance.json", mediaType: "application/json", contents: stableJson(replay.provenance) + "\n" });
  for (const assertion of result.assertions) {
    const witness = replay.originalRetrievalByRecordId.get(assertion.source_record_id ?? "");
    if (!witness) throw new Error("Replayed assertion lacks an original provider row.");
    assertion.retrieved_at = witness.retrievedAt;
    assertion.notes.push(`Original provider retrieval: ${witness.retrievedAt}; retained row SHA256 ${witness.rowSha256}; ${witness.artifactPath}; archived commit ${replay.archiveCommit}.`);
  }
  result.warnings.push("Upstream request timestamps mark local response replay; original provider retrieval dates remain in assertion retrieved_at and the retained-replay provenance artifact. No live source request was issued.");
}
