import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { JurisdictionEvidenceRecord } from "@/lib/research/types";
import { validateJurisdictionEvidenceRegistry } from "@/lib/research/jurisdiction-evidence";
import { verifyIndependentJurisdictionReview, JURISDICTION_PRECISION_REVIEW_VERSION } from "@/lib/research/jurisdiction-agent-review";
import { sha256, stableJson } from "@/lib/research/run-files";

export const AGENT_JURISDICTION_RECORDS_PATH = "src/data/research/jurisdiction-agent-records.json";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function read(root: string, filename: string): Buffer {
  assert(!path.isAbsolute(filename) && !filename.includes("\\") && !filename.split("/").includes(".."), "Unsafe review input path.");
  return readFileSync(path.join(root, filename));
}
export function approvedAgentParentRecords(root: string): JurisdictionEvidenceRecord[] {
  const file = JSON.parse(read(root, AGENT_JURISDICTION_RECORDS_PATH).toString("utf8")) as { schemaVersion: number; updatedAt: string; records: JurisdictionEvidenceRecord[] };
  assert(file.schemaVersion === 1 && Array.isArray(file.records), "Invalid agent jurisdiction record collection.");
  const countyRegistry = JSON.parse(read(root, "src/data/research/county-equivalent-registry.json").toString("utf8"));
  const stateRegistry = JSON.parse(read(root, "src/data/research/state-registry.json").toString("utf8"));
  validateJurisdictionEvidenceRegistry({ registry: { schemaVersion: 1, updatedAt: file.updatedAt, records: file.records }, countyRegistry, stateRegistry });
  for (const record of file.records) {
    assert(record.jurisdiction.level === "state", "Version 1 requires an explicit complete state interpretation; other scopes need a separately tested method.");
    const review = record.review;
    assert(review.gate === "agent-reviewed", "Agent record collection cannot manufacture human approval.");
    const reviewBytes = read(root, review.independentReview.path);
    verifyIndependentJurisdictionReview(record, reviewBytes);
    const independent = JSON.parse(reviewBytes.toString("utf8"));
    const originalBytes = read(root, independent.input.path);
    assert(sha256(originalBytes) === independent.input.sha256, record.id + ": original interpretation bytes changed.");
    const original = JSON.parse(originalBytes.toString("utf8"));
    assert(original.species.id === record.speciesId && (original.scope.stateCode ?? null) === record.jurisdiction.stateCode
      && original.scope.countyCount === record.jurisdiction.countyFips.length, record.id + ": independent interpretation taxon or scope differs.");
    if (Array.isArray(original.scope.countyFips)) assert(stableJson(original.scope.countyFips) === stableJson(record.jurisdiction.countyFips), record.id + ": independently reviewed county set differs.");
    for (const retained of [...original.sources, ...(independent.supplementalSources ?? [])]) {
      const bytes = read(root, retained.path);
      assert(sha256(bytes) === retained.storedSha256, record.id + ": reviewed contextual artifact bytes changed.");
      const decoded = retained.path.endsWith(".gz") ? gunzipSync(bytes) : bytes;
      assert(sha256(decoded) === (retained.decodedSha256 ?? retained.sha256), record.id + ": reviewed contextual decoded bytes changed.");
    }
    for (const document of record.sourceDocuments) {
      const bytes = read(root, document.artifactPath);
      assert(sha256(bytes) === document.artifactSha256, record.id + ": retained official source bytes changed.");
      const originalSource = original.sources.find((s: { path: string; storedSha256: string }) => s.path === document.artifactPath && s.storedSha256 === document.artifactSha256);
      assert(originalSource, record.id + ": source document was not part of the independent interpretation.");
      assert(document.url === originalSource.url, record.id + ": source URL differs from retained acquisition.");
      const interpretation = original.interpretation.find((i: { source: string }) => path.basename(document.artifactPath).startsWith(i.source + "."));
      assert(interpretation && (document.publishedAt === null || document.publishedAt === interpretation.publishedAt)
        && (document.modifiedAt === null || document.modifiedAt === interpretation.modifiedAt), record.id + ": source date differs from independent interpretation.");
      if (document.informationYear !== undefined) assert(document.informationYear === interpretation.informationYear, record.id + ": source information year differs from independent interpretation.");
      if (review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION && document.sourceId === review.declarationSourceId) {
        assert(interpretation.statementType === record.statementType && interpretation.sourceDatePrecision === "year", record.id + ": reviewed official status or date precision differs.");
      }
      const decoded = document.artifactPath.endsWith(".gz") ? gunzipSync(bytes) : bytes;
      assert(sha256(decoded) === originalSource.sha256, record.id + ": decoded source bytes changed.");
      const normalized = decoded.toString("utf8").replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
      assert(normalized.includes(document.supportText.replace(/\s+/gu, " ").trim()), record.id + ": source witness text is not in the retained document.");
    }
  }
  return file.records;
}
export function agentParentInputPaths(root: string): string[] {
  const inputs = new Set([AGENT_JURISDICTION_RECORDS_PATH, "src/data/research/jurisdiction-evidence-registry.json",
    "src/lib/research/jurisdiction-agent-review.ts", "scripts/research/agent-jurisdiction-records.ts"]);
  for (const record of approvedAgentParentRecords(root)) {
    if (record.review.gate !== "agent-reviewed") continue;
    inputs.add(record.review.independentReview.path);
    const independent = JSON.parse(read(root, record.review.independentReview.path).toString("utf8"));
    inputs.add(independent.input.path);
    const original = JSON.parse(read(root, independent.input.path).toString("utf8"));
    [...original.sources, ...(independent.supplementalSources ?? [])].forEach((source: { path: string }) => inputs.add(source.path));
    record.sourceDocuments.forEach(document => inputs.add(document.artifactPath));
  }
  return [...inputs].sort();
}
export function loadAgentParent(root: string, id: string, expectedSha256: string) {
  const record = approvedAgentParentRecords(root).find(r => r.id === id);
  assert(record && sha256(stableJson(record)) === expectedSha256, "Reviewed parent identity or bytes differ from the committed plan.");
  assert(record.review.gate === "agent-reviewed", "Parent has no agent review.");
  const independent = JSON.parse(read(root, record.review.independentReview.path).toString("utf8"));
  const original = JSON.parse(read(root, independent.input.path).toString("utf8"));
  return { record, original, recordBytes: read(root, AGENT_JURISDICTION_RECORDS_PATH) };
}
