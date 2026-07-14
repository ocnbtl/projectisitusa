import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  EvidenceAssertion,
  ResearchCountyFile,
  ResearchRunReceipt,
  ResearchSourceRegistry,
} from "@/lib/research/types";

type RunsFile = { schemaVersion: 1; runs: ResearchRunReceipt[] };

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, ".cache/research/isitusa.sqlite");

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function readNdjson<T>(filepath: string): T[] {
  return readFileSync(filepath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

mkdirSync(path.dirname(OUTPUT), { recursive: true });
rmSync(OUTPUT, { force: true });

const registry = readJson<ResearchSourceRegistry>(path.join(ROOT, "src/data/research/source-registry.json"));
const evidence = readNdjson<EvidenceAssertion>(path.join(ROOT, "src/data/research/evidence-assertions.ndjson"));
const runs = readJson<RunsFile>(path.join(ROOT, "src/data/research/research-runs.json")).runs;
const countyDir = path.join(ROOT, "public/generated/research/AL/counties");
const countyFiles = readdirSync(countyDir).filter((filename) => filename.endsWith(".json")).sort();

const db = new DatabaseSync(OUTPUT);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE sources (
    source_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    authority TEXT NOT NULL,
    tier TEXT NOT NULL,
    status TEXT NOT NULL,
    homepage TEXT NOT NULL,
    caveat TEXT NOT NULL
  );

  CREATE TABLE evidence (
    evidence_id TEXT PRIMARY KEY,
    state_code TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    species_id TEXT NOT NULL,
    assertion TEXT NOT NULL,
    scope TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    source_label TEXT NOT NULL,
    url TEXT NOT NULL,
    external_record_id TEXT,
    observed_at TEXT,
    reviewed_at TEXT,
    accessed_at TEXT,
    lineage TEXT NOT NULL,
    caveat TEXT NOT NULL
  );

  CREATE TABLE research_runs (
    run_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    state_code TEXT NOT NULL,
    status TEXT NOT NULL,
    scope TEXT NOT NULL,
    accessed_at TEXT,
    accepted_pair_count INTEGER NOT NULL,
    artifact_path TEXT NOT NULL,
    caveat TEXT NOT NULL
  );

  CREATE TABLE run_targets (
    run_id TEXT NOT NULL REFERENCES research_runs(run_id),
    species_id TEXT NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (run_id, species_id, result)
  );

  CREATE TABLE pair_status (
    state_code TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    county_name TEXT NOT NULL,
    species_id TEXT NOT NULL,
    common_name TEXT NOT NULL,
    scientific_name TEXT NOT NULL,
    category TEXT NOT NULL,
    display_status TEXT NOT NULL,
    determination_status TEXT NOT NULL,
    survey_status TEXT NOT NULL,
    research_status TEXT NOT NULL,
    freshness_status TEXT NOT NULL,
    conflict INTEGER NOT NULL,
    evidence_count INTEGER NOT NULL,
    screened_source_ids TEXT NOT NULL,
    PRIMARY KEY (county_fips, species_id)
  );
`);

const insertSource = db.prepare(`
  INSERT INTO sources (source_id, label, authority, tier, status, homepage, caveat)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertEvidence = db.prepare(`
  INSERT INTO evidence (
    evidence_id, state_code, county_fips, species_id, assertion, scope, source_id,
    source_label, url, external_record_id, observed_at, reviewed_at, accessed_at, lineage, caveat
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertRun = db.prepare(`
  INSERT INTO research_runs (
    run_id, source_id, state_code, status, scope, accessed_at, accepted_pair_count, artifact_path, caveat
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertTarget = db.prepare(`
  INSERT INTO run_targets (run_id, species_id, result) VALUES (?, ?, ?)
`);
const insertPair = db.prepare(`
  INSERT INTO pair_status (
    state_code, county_fips, county_name, species_id, common_name, scientific_name,
    category, display_status, determination_status, survey_status, research_status,
    freshness_status, conflict, evidence_count, screened_source_ids
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.exec("BEGIN");
try {
  for (const source of registry.sources) {
    insertSource.run(source.id, source.label, source.authority, source.tier, source.status, source.homepage, source.caveat);
  }
  for (const entry of evidence) {
    insertEvidence.run(
      entry.evidenceId,
      entry.stateCode,
      entry.countyFips,
      entry.speciesId,
      entry.assertion,
      entry.scope,
      entry.sourceId,
      entry.sourceLabel,
      entry.url,
      entry.externalRecordId ?? null,
      entry.observedAt ?? null,
      entry.reviewedAt ?? null,
      entry.accessedAt ?? null,
      entry.lineage,
      entry.caveat,
    );
  }
  for (const run of runs) {
    insertRun.run(
      run.runId,
      run.sourceId,
      run.stateCode,
      run.status,
      run.scope,
      run.accessedAt,
      run.acceptedPairCount,
      run.artifactPath,
      run.caveat,
    );
    const accepted = new Set(run.acceptedSpeciesIds);
    for (const speciesId of run.targetSpeciesIds) {
      insertTarget.run(run.runId, speciesId, accepted.has(speciesId) ? "accepted" : "screened-no-record");
    }
  }
  for (const filename of countyFiles) {
    const county = readJson<ResearchCountyFile>(path.join(countyDir, filename));
    for (const pair of county.pairs) {
      insertPair.run(
        county.stateCode,
        county.countyFips,
        county.countyName,
        pair.speciesId,
        pair.commonName,
        pair.scientificName,
        pair.category,
        pair.displayStatus,
        pair.determinationStatus,
        pair.surveyStatus,
        pair.researchStatus,
        pair.freshnessStatus,
        pair.conflict ? 1 : 0,
        pair.evidence.length,
        JSON.stringify(pair.screenedBySourceIds),
      );
    }
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

db.exec(`
  CREATE INDEX evidence_county_species_idx ON evidence (county_fips, species_id);
  CREATE INDEX evidence_source_idx ON evidence (source_id);
  CREATE INDEX evidence_assertion_idx ON evidence (assertion);
  CREATE INDEX pair_status_status_idx ON pair_status (display_status);
  CREATE INDEX pair_status_species_idx ON pair_status (species_id);
  CREATE INDEX pair_status_county_idx ON pair_status (county_fips);
  CREATE INDEX run_targets_species_idx ON run_targets (species_id);
  PRAGMA optimize;
`);

const counts = {
  sources: Number((db.prepare("SELECT COUNT(*) AS count FROM sources").get() as { count: number }).count),
  evidence: Number((db.prepare("SELECT COUNT(*) AS count FROM evidence").get() as { count: number }).count),
  runs: Number((db.prepare("SELECT COUNT(*) AS count FROM research_runs").get() as { count: number }).count),
  pairStatuses: Number((db.prepare("SELECT COUNT(*) AS count FROM pair_status").get() as { count: number }).count),
};
db.close();

console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), ...counts }, null, 2));
