import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha256 } from "@/lib/research/run-files";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { applyInaturalistReplayProvenance, loadInaturalistArchivedReplay } from "./research/inaturalist-archived-replay";
import { inaturalistGbifResearchGradeAdapter } from "./research/adapters/inaturalist-gbif-research-grade";

async function main() {
  const archiveRunId = "20260902T234800Z__inaturalist-research-grade__d554b771e687";
  const receipt = JSON.parse(readFileSync(`src/data/research/runs/${archiveRunId}/receipt.json`, "utf8"));
  const archiveCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const expectedSpecies = [
    { speciesId: "linepithema-humile", scientificName: "Linepithema humile" },
    { speciesId: "solenopsis-invicta", scientificName: "Solenopsis invicta" },
    { speciesId: "streptopelia-decaocto", scientificName: "Streptopelia decaocto" },
  ];
  const requestedPairKeys = expectedSpecies.map(species => `11001:${species.speciesId}`);
  const requestedParameters = { ...receipt.parameters, candidateLimit: 3, candidatePairs: requestedPairKeys,
    allowedLicenses: ["http://creativecommons.org/publicdomain/zero/1.0/legalcode", "http://creativecommons.org/licenses/by/4.0/legalcode"] };
  const input = { repositoryRoot: process.cwd(), archiveCommit, archiveRunId, stateCode: "DC", requestedPairKeys, requestedParameters, expectedSpecies };
  const replay = loadInaturalistArchivedReplay(input);
  assert.equal(replay.requestUrls.length, 6);
  const realFetch = globalThis.fetch;
  globalThis.fetch = replay.fetch;
  try {
    const result = await inaturalistGbifResearchGradeAdapter.run({ runId: "synthetic-inaturalist-retained-replay", sourceId: "inaturalist-research-grade", stateCode: "DC", runStartedAt: new Date().toISOString(), parameters: requestedParameters,
      requestedPairs: expectedSpecies.map(species => ({ countyFips: "11001", countyName: "District of Columbia", ...species })) });
    assert.equal(result.errors.length, 0);
    assert.equal(result.assertions.length, 0, "A restricted-license row or empty source was converted into a determination.");
    assert.equal(result.outcomes.length, 3);
    assert(result.outcomes.every(outcome => outcome.scope_complete && outcome.status === "no-qualifying-evidence"));
    assert.equal(replay.reusedArtifactCount, 6);
    const dove = replay.originalRetrievalByRecordId.get("5840357636");
    assert(dove && dove.retrievedAt.startsWith("2026-09-02"), "Original provider retrieval date was lost.");
    assert.equal(dove.rowSha256.length, 64);
    await assert.rejects(() => replay.fetch("https://api.gbif.org/v1/unretained"), /Unretained request blocked/);
    await assert.rejects(() => replay.fetch(replay.requestUrls[0], { method: "POST" }), /GET only/);
  } finally { globalThis.fetch = realFetch; }
  assert.throws(() => loadInaturalistArchivedReplay({ ...input, stateCode: "VA" }), /state mismatch/);
  assert.throws(() => loadInaturalistArchivedReplay({ ...input, archiveRunId: "../outside" }), /run ID/);
  assert.throws(() => loadInaturalistArchivedReplay({ ...input, requestedPairKeys: ["11001:not-in-original-scope"] }), /complete original outcome/);
  assert.throws(() => loadInaturalistArchivedReplay({ ...input, requestedPairKeys: [...requestedPairKeys, requestedPairKeys[0]] }), /unique nonempty/);
  assert.throws(() => loadInaturalistArchivedReplay({ ...input, requestedParameters: { ...requestedParameters, expectedCrawlId: 606 } }), /snapshot parameter/);
  assert.throws(() => loadInaturalistArchivedReplay({ ...input, requestedParameters: { ...requestedParameters, pageLimit: 100 } }), /snapshot parameter/);
  assert.throws(() => loadInaturalistArchivedReplay({ ...input, requestedParameters: { ...requestedParameters, allowedLicenses: ["unregistered"] } }), /license scope/);
  const gaRun = "20260902T195311Z__inaturalist-research-grade__f86b22f39c15";
  const gaReceipt = JSON.parse(readFileSync(`src/data/research/runs/${gaRun}/receipt.json`, "utf8"));
  const gaSpecies = [{ speciesId: "streptopelia-decaocto", scientificName: "Streptopelia decaocto" }];
  const gaParameters = { ...gaReceipt.parameters, candidateLimit: 1, candidatePairs: ["13073:streptopelia-decaocto"], allowedLicenses: requestedParameters.allowedLicenses };
  const gaReplay = loadInaturalistArchivedReplay({ repositoryRoot: process.cwd(), archiveCommit, archiveRunId: gaRun, stateCode: "GA", requestedPairKeys: gaParameters.candidatePairs, requestedParameters: gaParameters, expectedSpecies: gaSpecies });
  globalThis.fetch = gaReplay.fetch;
  try {
    const result = await inaturalistGbifResearchGradeAdapter.run({ runId: "synthetic-inaturalist-garden-recovery", sourceId: "inaturalist-research-grade", stateCode: "GA", runStartedAt: new Date().toISOString(), parameters: gaParameters, requestedPairs: [{ countyFips: "13073", countyName: "Columbia", ...gaSpecies[0] }] });
    assert.equal(result.errors.length, 0);
    assert.equal(result.assertions.length, 1);
    assert.equal(result.assertions[0].source_record_id, "5087783411");
    applyInaturalistReplayProvenance(result, gaReplay);
    assert.equal(result.assertions[0].source_record_date, "2025-03-08T18:01:26");
    assert.equal(result.assertions[0].retrieved_at, gaReplay.originalRetrievalByRecordId.get("5087783411")!.retrievedAt);
    assert(result.assertions[0].created_at > result.assertions[0].retrieved_at, "Replay creation replaced original acquisition chronology.");
    assert(result.assertions[0].notes.some(note => note.includes("Observation metadata license:")));
    assert(result.artifacts.some(artifact => artifact.filename === "inaturalist-retained-replay-provenance.json"));
    assert.equal(result.assertions[0].claim_type, "recorded-present");
    assert.equal(gaReplay.reusedArtifactCount, 2);
  } finally { globalThis.fetch = realFetch; }
  // Build isolated committed corruption fixtures. Canonical evidence is never modified.
  const fixtureParent = path.resolve(".cache/research/inaturalist-replay-tests");
  mkdirSync(fixtureParent, { recursive: true });
  const fixtureRoot = mkdtempSync(path.join(fixtureParent, "tamper-"));
  const runRoot = `src/data/research/runs/${gaRun}`;
  const fixtureWrite = (relativePath: string, bytes: string | Buffer) => {
    const target = path.resolve(fixtureRoot, relativePath);
    assert(target.startsWith(fixtureRoot + path.sep), "Fixture write escaped its private directory.");
    mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes);
  };
  const git = (...args: string[]) => execFileSync("git", ["-c", `safe.directory=${fixtureRoot}`, "-c", "core.longpaths=true", "-c", "core.autocrlf=false", "-C", fixtureRoot, ...args], { encoding: "utf8" });
  git("init", "--quiet");
  const selectedArtifactRefs = gaReceipt.artifacts.filter((ref: { path: string }) => ref.path.includes("-streptopelia-decaocto"));
  for (const ref of [...gaReceipt.outputs, ...selectedArtifactRefs]) fixtureWrite(ref.path, readFileSync(ref.path));
  fixtureWrite(runRoot + "/receipt.json", JSON.stringify(gaReceipt));
  const commitFixture = () => { git("add", "--", "src"); git("-c", "user.name=Replay Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Retained replay fixture"); return git("rev-parse", "HEAD").trim(); };
  const fixtureInput = { repositoryRoot: fixtureRoot, archiveCommit: commitFixture(), archiveRunId: gaRun, stateCode: "GA", requestedPairKeys: gaParameters.candidatePairs, requestedParameters: gaParameters, expectedSpecies: gaSpecies };
  assert.equal(loadInaturalistArchivedReplay(fixtureInput).requestUrls.length, 2, "Valid isolated fixture failed.");
  const occurrenceRef = selectedArtifactRefs.find((ref: { path: string }) => ref.path.includes("gbif-occurrences-"));
  const originalBytes = readFileSync(occurrenceRef.path);
  fixtureWrite(occurrenceRef.path, Buffer.concat([originalBytes, Buffer.from([1])]));
  assert.throws(() => loadInaturalistArchivedReplay({ ...fixtureInput, archiveCommit: commitFixture() }), /reference changed/);
  const page = JSON.parse(gunzipSync(originalBytes).toString("utf8")); page.count += 1;
  const changedBytes = gzipSync(Buffer.from(JSON.stringify(page)));
  fixtureWrite(occurrenceRef.path, changedBytes);
  const changedReceipt = structuredClone(gaReceipt);
  const changedRef = changedReceipt.artifacts.find((ref: { path: string }) => ref.path === occurrenceRef.path);
  changedRef.bytes = changedBytes.length; changedRef.sha256 = sha256(changedBytes);
  fixtureWrite(runRoot + "/receipt.json", JSON.stringify(changedReceipt));
  assert.throws(() => loadInaturalistArchivedReplay({ ...fixtureInput, archiveCommit: commitFixture() }), /declared total/);
  fixtureWrite(occurrenceRef.path, originalBytes);
  const incompleteReceipt = structuredClone(gaReceipt);
  const outcomeRef = incompleteReceipt.outputs.find((ref: { path: string }) => ref.path.endsWith("/outcomes.ndjson"));
  const changedOutcomes = readFileSync(outcomeRef.path, "utf8").trim().split(/\r?\n/u).map(line => JSON.parse(line));
  const targetOutcome = changedOutcomes.find(row => row.county_fips === "13073" && row.species_id === "streptopelia-decaocto");
  targetOutcome.scope_complete = false;
  const outcomeContent = changedOutcomes.map(row => JSON.stringify(row)).join("\n") + "\n";
  outcomeRef.bytes = Buffer.byteLength(outcomeContent); outcomeRef.sha256 = sha256(outcomeContent);
  fixtureWrite(outcomeRef.path, outcomeContent); fixtureWrite(runRoot + "/receipt.json", JSON.stringify(incompleteReceipt));
  assert.throws(() => loadInaturalistArchivedReplay({ ...fixtureInput, archiveCommit: commitFixture() }), /complete original outcome/);
  console.log("Retained iNaturalist replay passed: eight real archived responses, original retrieval lineage, isolated hash/count/completeness corruption fixtures, scope/snapshot/license boundaries, no network fallback, and no negative biological claims.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
