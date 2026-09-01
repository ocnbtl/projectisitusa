import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { validateJurisdictionEvidenceRegistry } from "@/lib/research/jurisdiction-evidence";
import type {
  JurisdictionEvidenceRegistry,
  JurisdictionEvidenceSourceDocument,
} from "@/lib/research/types";

const ROOT = process.cwd();
const APPROVAL_REQUEST_PATH =
  "ops/national-research/evaluations/jurisdiction-wide-eradication-human-approval-request-20260901-r1.json";
const APPROVAL_REQUEST_SHA256 =
  "94888e583e80c60daba0c0210867013fe4d5a9d342021e96828272c9c88bc0a5";
const APPROVAL_RECEIPT_PATH =
  "ops/national-research/evaluations/jurisdiction-wide-eradication-human-approval-receipt-20260901-r1.json";
const PREFLIGHT_PATH =
  "ops/national-research/evaluations/post-usfws-jurisdiction-wide-absence-contract-preflight-20260824-r1.json";
const REGISTRY_PATH = "src/data/research/jurisdiction-evidence-registry.json";

type RetainedSource = {
  id: string;
  url: string;
  artifactPath: string;
  sha256: string;
  supportText: string;
  supportTextSha256: string;
  publishedAt: string | null;
  modifiedAt: string | null;
};

type ApprovalRequest = {
  evaluationId: string;
  dependencyEvidence: { priorPreflight: { path: string; sha256: string } };
  exactApprovalRequest: {
    approvalPhrase: string;
    parentJurisdictionRecords: Array<{
      recordId: string;
      speciesId: string;
      statementType: "officially-eradicated";
      jurisdictionLevel: "nation" | "county-set";
      jurisdictionId: string;
      stateCode: string | null;
      countyFips?: string[];
      countyFipsSha256: string;
      exclusions: string[];
      effectiveAt: string;
      reaffirmedAt: string;
      validThrough: string;
      sourceDocumentIds: string[];
    }>;
  };
};

type ApprovalReceipt = {
  status: "human-approved";
  actorId: string;
  recordedAt: string;
  approvalPhrase: string;
  approvedArtifact: { path: string; sha256: string };
};

type CountyRegistry = Parameters<typeof validateJurisdictionEvidenceRegistry>[0]["countyRegistry"];
type StateRegistry = Parameters<typeof validateJurisdictionEvidenceRegistry>[0]["stateRegistry"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

function fipsHash(values: string[]) {
  return sha256(JSON.stringify(values));
}

function buildRegistry() {
  const approvalRequestBytes = readFileSync(path.join(ROOT, APPROVAL_REQUEST_PATH));
  assert(sha256(approvalRequestBytes) === APPROVAL_REQUEST_SHA256, "Approved request artifact hash changed.");
  const approvalRequest = JSON.parse(approvalRequestBytes.toString("utf8")) as ApprovalRequest;
  const approvalReceipt = readJson<ApprovalReceipt>(APPROVAL_RECEIPT_PATH);
  assert(approvalRequest.evaluationId === "jurisdiction-wide-eradication-human-approval-request-20260901-r1", "Approval request identity changed.");
  assert(approvalReceipt.status === "human-approved", "Approval receipt is not human approved.");
  assert(approvalReceipt.actorId === "Ocean", "Approval actor differs from the approved request.");
  assert(approvalReceipt.approvalPhrase === approvalRequest.exactApprovalRequest.approvalPhrase, "Approval phrase differs from the exact request.");
  assert(approvalReceipt.approvedArtifact.path === APPROVAL_REQUEST_PATH, "Approval receipt references another artifact.");
  assert(approvalReceipt.approvedArtifact.sha256 === APPROVAL_REQUEST_SHA256, "Approval receipt hash differs from the approved artifact.");
  assert(Number.isFinite(Date.parse(approvalReceipt.recordedAt)), "Approval receipt timestamp is invalid.");
  assert(approvalRequest.dependencyEvidence.priorPreflight.path === PREFLIGHT_PATH, "Approved request references another preflight.");
  const preflightBytes = readFileSync(path.join(ROOT, PREFLIGHT_PATH));
  assert(sha256(preflightBytes) === approvalRequest.dependencyEvidence.priorPreflight.sha256, "Approved preflight artifact hash changed.");
  const preflight = JSON.parse(preflightBytes.toString("utf8")) as {
    retainedSources: RetainedSource[];
  };
  const sourceById = new Map(preflight.retainedSources.map((source) => [source.id, source]));
  const countyRegistry = readJson<CountyRegistry>("src/data/research/county-equivalent-registry.json");
  const stateRegistry = readJson<StateRegistry>("src/data/research/state-registry.json");
  const nationalStateCodes = new Set(stateRegistry.nationalV1.certificationOrder);
  const nationalCountyFips = countyRegistry.countyEquivalents
    .filter((county) => county.status === "active" && nationalStateCodes.has(county.stateCode))
    .map((county) => county.countyFips)
    .sort();

  function sourceDocument(sourceId: string): JurisdictionEvidenceSourceDocument {
    const source = sourceById.get(sourceId);
    assert(source, `Approved source document ${sourceId} is absent from the retained preflight.`);
    const artifactBytes = readFileSync(path.join(ROOT, source.artifactPath));
    assert(sha256(artifactBytes) === source.sha256, `Retained artifact hash changed for ${sourceId}.`);
    assert(sha256(source.supportText) === source.supportTextSha256, `Retained support text hash changed for ${sourceId}.`);
    return {
      sourceId,
      url: source.url,
      artifactPath: source.artifactPath,
      artifactSha256: source.sha256,
      supportText: source.supportText,
      supportTextSha256: source.supportTextSha256,
      publishedAt: source.publishedAt,
      modifiedAt: source.modifiedAt,
    };
  }

  const records = approvalRequest.exactApprovalRequest.parentJurisdictionRecords.map((approved) => {
    const countyFips = approved.jurisdictionLevel === "nation"
      ? nationalCountyFips
      : [...(approved.countyFips ?? [])].sort();
    assert(countyFips.length === (approved.jurisdictionLevel === "nation" ? 3144 : 3), `${approved.recordId} county count differs from approval.`);
    assert(fipsHash(countyFips) === approved.countyFipsSha256, `${approved.recordId} county FIPS hash differs from approval.`);
    assert(approved.exclusions.length === 0, `${approved.recordId} contains an unapproved exclusion.`);
    return {
      schemaVersion: 1 as const,
      id: approved.recordId,
      speciesId: approved.speciesId,
      statementType: approved.statementType,
      sourceDocuments: approved.sourceDocumentIds.map(sourceDocument),
      jurisdiction: {
        level: approved.jurisdictionLevel,
        id: approved.jurisdictionId,
        stateCode: approved.stateCode,
        countyFips,
        countyFipsSha256: approved.countyFipsSha256,
        exclusions: [],
      },
      effectiveAt: approved.effectiveAt,
      reaffirmedAt: approved.reaffirmedAt,
      validThrough: approved.validThrough,
      review: {
        gate: "human-approved" as const,
        status: "human-approved" as const,
        actorId: approvalReceipt.actorId,
        reviewedAt: approvalReceipt.recordedAt,
      },
      caveats: approved.speciesId === "vespa-mandarinia"
        ? [
            "The national determination is current only through 2026-11-03 and fails closed afterward without a new authoritative reaffirmation.",
            "Historical Whatcom County occurrence is retained separately from the current officially-eradicated determination.",
          ]
        : [
            "Hudson County was declared eradicated in 2008; the shared 2013 effective date is a conservative date for the approved three-county set.",
            "Historical Hudson, Middlesex, and Union County occurrences are retained separately from the current officially-eradicated determination.",
          ],
    };
  });
  const registry: JurisdictionEvidenceRegistry = {
    schemaVersion: 1,
    updatedAt: "2026-09-01",
    records,
  };
  const schema = readJson<Parameters<typeof z.fromJSONSchema>[0]>(
    "src/data/research/schemas/jurisdiction-evidence-registry.schema.json",
  );
  z.fromJSONSchema(schema).parse(registry);
  validateJurisdictionEvidenceRegistry({ registry, countyRegistry, stateRegistry });
  return `${JSON.stringify(registry, null, 2)}\n`;
}

const mode = process.argv[2] ?? "--check";
assert(mode === "--write" || mode === "--check", "Use --write or --check.");
const generated = buildRegistry();
const absoluteRegistryPath = path.join(ROOT, REGISTRY_PATH);
if (mode === "--write") {
  writeFileSync(absoluteRegistryPath, generated);
} else {
  const current = readFileSync(absoluteRegistryPath, "utf8");
  assert(current === generated, `${REGISTRY_PATH} differs from the approved deterministic registry.`);
}
process.stdout.write(`${JSON.stringify({ mode, path: REGISTRY_PATH, recordCount: 2, sha256: sha256(generated) }, null, 2)}\n`);
