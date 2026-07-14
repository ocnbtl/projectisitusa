# Evidence Research System

## Status

This document defines the operating model for county-species evidence research. The bootstrap ledger, compiler, SQLite index, Alabama projections, and research control center are implemented. Paths marked `Required` remain acceptance work and must not be presented as complete.

The public Next.js application remains static. Source acquisition, research, review, compilation, SQLite indexing, and projection generation happen before the application build or in local tooling. Production requests must not depend on source APIs, research agents, or SQLite.

## Goals

1. Preserve every accepted assertion, rejection, review decision, correction, and source run as auditable history.
2. Separate facts that the legacy matrix currently compresses together.
3. Make source acquisition repeatable through registered, parameterized adapters.
4. Compile truth deterministically from versioned inputs without network access.
5. Give researchers a fast local query surface without making SQLite authoritative.
6. Publish small static state and county projections for the public application.
7. Measure research coverage independently from determination coverage.

## Invariants

- Missing data is unknown. Missing data is never absence or non-detection.
- Negative evidence must be explicit in the source and exact enough to support the county-species claim.
- Evidence history is append-only. Corrections append events that retract or supersede earlier events.
- Agents never edit the compiled truth matrix, generated metrics, SQLite index, or public projections.
- Every evidence and rejection record references a source run.
- Every source run references a registered source, adapter version, parameters, artifacts, and receipt.
- The compiler performs no network access and receives an explicit `as_of` date.
- Generated outputs use stable ordering and are byte-identical for identical inputs and `as_of` date.
- Research completion can leave a county-species pair unknown.
- A survey non-detection can coexist with verified historical or current presence because survey and determination are separate axes.

## Current Compatibility Baseline

The current system builds presence from `src/data/generated/presence.json`, non-presence compatibility statuses from `src/data/source/county-species-status-overrides.ts`, and state matrix reports with `scripts/build-state-coverage-matrix.ts`.

The Alabama baseline verified from `docs/county-coverage/states/AL.md` on 2026-07-14 at commit `ae9d573` was:

| Metric | Count |
| --- | ---: |
| Species | 2504 |
| Counties | 67 |
| County-species pairs | 167768 |
| Verified present | 15133 |
| Verified absent | 0 |
| Not detected | 8 |
| Legacy unknown | 152627 |
| Known | 15141 |
| Known percent | 9.02% |

This is a migration parity target, not an evergreen count. Rebuild and reread generated outputs before making any current count claim.

The first compiler checkpoint verified on 2026-07-14 produced:

| Metric | Count |
| --- | ---: |
| Registered sources | 29 |
| Research runs | 15 |
| Evidence records | 30130 |
| Verified present | 15133 |
| Verified absent | 0 |
| Survey not detected | 8 |
| Researched unresolved | 95580 |
| Not researched | 57047 |
| Determination coverage | 9.02% |
| Source-screen research coverage | 66.00% |
| Conflicts | 0 |
| Legacy fallback pairs | 1558 |
| Deferred distinct migration candidates | 176 |

The 66.00% bootstrap metric means the pair has a resolved status or its species has been included in at least one completed statewide source-family screen. It does not mean the category protocol is complete, all relevant sources were searched, or the species is absent from unresolved counties.

## System Boundary

```text
registered source + parameters
  -> source adapter
  -> immutable artifacts and source-run receipt
  -> evidence assertions, rejections, and pair outcomes
  -> review, retraction, and superseding events
  -> deterministic compiler
  -> generated truth and metrics
  -> local SQLite query index
  -> static state and county public projections
  -> static Next.js build
```

Only the final static projections cross into the public application boundary. Raw artifacts, rejection details, reviewer notes, local paths, and SQLite stay outside the public bundle.

## Repository Layout

Inspect current files before implementing a required target. Current paths are established by the first compatibility foundation. Required paths remain acceptance work and must not be claimed as complete merely because this document names them.

| Path | Status | Role |
| --- | --- | --- |
| `src/data/research/source-registry.json` | Current | Versioned source registry |
| `src/data/research/research-protocols.json` | Current | Versioned category and source-screen protocols |
| `src/data/research/evidence-assertions.ndjson` | Current | Append-only migrated evidence assertion ledger |
| `src/data/research/research-runs.json` | Current bootstrap | Combined migration run records, not final immutable per-run receipts |
| `src/data/research/migration-candidates.json` | Current bootstrap | Deferred migration candidates for review |
| `src/data/research/migration-report.json` | Current bootstrap | Legacy migration summary |
| `src/data/research/schemas/*.schema.json` | Required | Schemas for registry, events, receipts, outcomes, and projections |
| `src/data/research/review-events.ndjson` | Required | Append-only review, retraction, and superseding events |
| `src/data/research/rejections.ndjson` | Required | Append-only rejected candidate records |
| `src/data/research/runs/<run-id>/receipt.json` | Required | Immutable detailed source-run receipt |
| `src/data/research/runs/<run-id>/outcomes.ndjson` | Required | Pair-level research outcomes covered by the receipt |
| `src/data/research/runs/<run-id>/artifacts/*` | Required when allowed | Raw or normalized source artifacts subject to retention and licensing |
| `src/lib/research/types.ts` | Current | Research domain types that still need the full review and event model |
| `src/lib/research/source-adapter.ts` | Current | Initial adapter contract |
| `scripts/migrate-research-ledger.ts` | Current bootstrap | Deterministic legacy evidence migration |
| `scripts/compile-research-index.ts` | Current bootstrap | Alabama compiler and static projection builder |
| `scripts/build-research-db.ts` | Current | Disposable SQLite index builder |
| `scripts/check-research-integrity.ts` | Current | Research parity and projection integrity checks |
| `scripts/research/adapters/<adapter-id>.ts` | Required | Parameterized source adapters for new acquisition runs |
| `scripts/research/run-source.ts` | Required | Registered source-run orchestrator |
| `src/data/generated/research/<STATE>/summary.json` | Current for Alabama | Generated build-time state summary |
| `.cache/research/isitusa.sqlite` | Current | Disposable local query index, never authoritative |
| `public/generated/research/<STATE>/summary.json` | Current for Alabama | Static public state projection |
| `public/generated/research/<STATE>/counties/<FIPS>.json` | Current for Alabama | Static public county projection |

`.cache/` is ignored. Verify the current ignore diff before changing it and do not overwrite concurrent ignore-file edits.

The architecture remains the acceptance contract where the compatibility foundation is incomplete. Known gaps include append-only review, retraction, and superseding events, detailed immutable per-run receipts, explicit pair outcomes, source-specific freshness policy, the separate review axis, and an explicit compiler `as_of` input.

`app/research/page.tsx` remains a static route. `src/components/research-control-center.tsx` fetches the committed public state summary and county shards from `public/generated/research/AL/` so the large queue is not embedded in initial HTML. Do not claim the route is complete until generated input, build, and route behavior are verified together.

## Append-Only Evidence Events

`src/data/research/evidence-assertions.ndjson` and `src/data/research/review-events.ndjson` form the logical evidence event stream. One JSON object occupies one line. Existing lines are never edited, reordered, or deleted. The assertions file exists now. The review-event file is required follow-up work.

Required event types:

- `evidence.asserted`: records a normalized source claim.
- `evidence.reviewed`: records a review decision and publication eligibility.
- `evidence.retracted`: invalidates an earlier assertion without erasing it.
- `evidence.superseded`: links an earlier assertion to a corrected replacement.

Every event requires:

- `schemaVersion`
- `eventId`
- `event_type`
- `created_at`
- `actor_type` and `actor_id`
- `run_id`
- `source_id`
- `species_id`
- `county_fips`
- `references` for related assertion, review, retraction, or superseding event IDs

An `evidence.asserted` event also requires:

- stable source record locator or source record ID
- source URL or artifact reference
- source publication or observation date when available
- retrieval date
- claim type and evidence kind
- taxon match method and matched source name
- geography match method and source geography
- source claim text or normalized structured fields
- temporal, spatial, and survey scope
- content hash of the normalized supporting payload
- caveats and notes needed to prevent overclaiming

Use content-derived IDs where practical so rerunning identical source input does not append duplicate assertions. A run may reference an existing assertion as corroboration instead of duplicating it.

## Rejection Records

Rejected candidates belong in `src/data/research/rejections.ndjson`, not in comments, temporary logs, or silent filters. A rejection records what was considered and why it was not accepted.

Required fields include `rejection_id`, `run_id`, `source_id`, candidate locator, candidate taxon, candidate geography, normalized target when one was considered, reason code, reviewer or adapter identity, timestamp, and supporting notes.

Initial reason codes should include:

- `taxon-mismatch`
- `taxon-ambiguous`
- `geography-missing`
- `geography-ambiguous`
- `outside-scope`
- `cultivated-or-captive`
- `record-failed`
- `source-contradiction`
- `duplicate`
- `insufficient-negative-scope`
- `unsupported-claim-type`

A rejection is not a negative determination. One or many rejected candidates do not prove that a species is absent or not detected.

## Source Registry

Every source must have one entry in `src/data/research/source-registry.json`. The source registry replaces source-specific assumptions scattered across scripts and handoff notes.

Each source entry must define:

- stable `source_id`, title, authority, citation, and canonical URLs
- jurisdictions and geographic granularity
- supported evidence kinds and claim types
- adapter ID and allowed adapter versions
- parameter schema and safe defaults
- taxon matching policy
- geography matching policy
- explicit negative evidence policy
- publication review gate
- freshness policy and claim persistence policy
- artifact retention and licensing rules
- rate limits, access constraints, and known source caveats
- enabled or retired status with dated rationale

Source capability is explicit. An occurrence-only source cannot emit absence or non-detection. A survey source cannot emit non-detection unless the registry and adapter capture target, effort, geography, time, and result semantics.

## Parameterized Source Adapters

An adapter implements transport and source normalization. Run scope belongs in parameters, not hard-coded one-off branches.

Adapter inputs include:

- source ID
- state or county scope
- species IDs or a versioned species-set reference
- date range or source snapshot identifier
- source-specific filters
- pagination and retry settings
- output directory

Adapter outputs include:

- acquired artifact metadata and hashes
- normalized evidence candidates
- rejection records
- pair-level research outcomes
- structured errors
- receipt fields

Adapters may access the network. They must not edit legacy truth inputs, the compiled truth matrix, generated SQLite, or public projections. Failed downloads must not replace a known-good cached artifact. Archive reuse must validate file type or signature as well as path existence.

## Source-Run Receipts

The compatibility migration currently writes combined bootstrap records to `src/data/research/research-runs.json`. Those records support parity and source-screen migration, but they are not the final immutable receipt model.

Every new adapter run writes `src/data/research/runs/<run-id>/receipt.json`. The receipt is immutable after completion. A correction creates a new run that references the old run.

A receipt records:

- run ID, status, start time, finish time, and actor
- source ID and exact registry content hash
- adapter ID, adapter version, and code commit
- complete normalized parameters
- requested state, county, species, date, and record scope
- upstream URLs, response metadata, artifact paths, byte counts, and hashes
- candidate, assertion, rejection, duplicate, and error counts
- explicit completion or partial-run status
- output file paths and hashes
- pair-outcome count and hash
- known caveats, source warnings, and deviations
- exact rerun command with secrets removed

Run IDs should use a sortable UTC timestamp, source ID, and short parameter hash. Receipts must never contain credentials or private tokens.

`src/data/research/runs/<run-id>/outcomes.ndjson` carries pair-level research outcomes when embedding them in the receipt would be too large. Each outcome states whether the pair scope was completed and uses one of:

- `evidence-found`
- `no-qualifying-evidence`
- `needs-followup`
- `blocked`

Only explicit pair outcomes with `scope_complete: true` can count as completed research. An overall successful HTTP request is not proof that every possible county-species pair was researched.

## Five Independent Axes

The compiler materializes these axes independently for each county-species pair.

### Determination

- `unknown`: no publishable explicit determination evidence.
- `verified-present`: accepted evidence explicitly supports county-level presence or occurrence.
- `verified-absent`: accepted evidence explicitly supports county-level absence under the registered source policy.
- `conflict`: internal compiler state when accepted present and absent evidence cannot be reconciled. Conflict is not published as truth.

### Survey

- `unassessed`: no accepted explicit survey result.
- `detected`: an accepted survey detected the target within its stated scope.
- `not-detected`: an accepted survey explicitly targeted the species and did not detect it within its stated scope.
- `inconclusive`: the survey was relevant but cannot support detected or not-detected under its methods or available fields.

### Research

- `not-started`
- `in-progress`
- `reviewed-evidence-found`
- `reviewed-no-qualifying-evidence`
- `needs-followup`
- `blocked`

`reviewed-no-qualifying-evidence` is a research result only. It leaves determination `unknown` and survey `unassessed` unless separate explicit evidence supports another value.

### Freshness

- `unknown`
- `current`
- `due`
- `stale`

Freshness is computed from the source registry policy, source dates, retrieval dates, claim persistence, and the compiler's explicit `as_of` date. The compiler never reads the wall clock implicitly. Stale presence evidence remains historical evidence unless a source policy or explicit retraction says otherwise. Stale negative evidence must not silently present itself as current absence.

### Review

- `not-reviewed`
- `machine-validated`
- `agent-reviewed`
- `human-approved`
- `rejected`
- `retracted`

The source registry defines the minimum review gate for publication. Manual browser findings default to human approval. A deterministic adapter may use machine validation only when its registry entry explicitly permits that gate. The compiler uses referenced review events, not mutable status fields on assertions.

## Compatibility Status

The legacy public status is derived from the independent axes:

1. Publish `verified-present` when determination is `verified-present`.
2. Publish `verified-absent` when determination is `verified-absent`.
3. Publish `not-detected` when determination is `unknown` and survey is `not-detected`.
4. Otherwise publish `unknown`.

This rule lets verified presence coexist with a later survey non-detection without deleting either fact. The detailed projection may expose both axes while the compatibility status remains present.

## Negative Evidence Rules

`verified-absent` requires an explicit authoritative statement that the exact species is absent from the exact county for a stated time and scope. A missing species from a list, map, API response, specimen collection, or occurrence export does not qualify.

`not-detected` requires an explicit survey result with:

- exact target taxon or a reviewed exact mapping
- county or finer location that resolves unambiguously to one county
- survey date or date range
- method or program identity
- enough effort or sampling context to interpret the result
- explicit zero, negative, not found, or equivalent source semantics
- no transformation that upgrades a narrower sampled area to countywide absence

Unknown remains the default when any required negative field is missing. Source silence, request failure, empty pagination, skipped candidates, and unsearched scope never create negative evidence.

## Deterministic Compiler

The compiler reads versioned local inputs only. It must:

1. Validate every registry entry, event, receipt, outcome, species ID, county FIPS, and reference.
2. Verify artifact and output hashes recorded by receipts when artifacts are retained.
3. Deduplicate content-equivalent assertions deterministically.
4. Apply review, retraction, and superseding events by stable event reference.
5. Enforce each source's capability and publication review gate.
6. Compute determination, survey, research, freshness, and review independently.
7. Fail on unresolved accepted present versus absent conflicts.
8. Derive compatibility status without treating missing rows as negative.
9. Sort every output by state, county FIPS, species ID, source ID, and event ID as applicable.
10. Write generated truth, metrics, and a machine-readable compiler report.

The compiler accepts `--as-of <YYYY-MM-DD>`. Identical inputs and the same `as_of` value must produce identical bytes. Network access, random IDs, unsorted iteration, local absolute paths, and implicit current timestamps are forbidden in compiler output.

## Coverage Metrics

All metrics use the explicit county-species denominator for the state.

`determination coverage` is:

```text
(verified-present + verified-absent) / total pairs
```

`legacy known compatibility coverage` is:

```text
(verified-present + verified-absent + compatibility not-detected) / total pairs
```

`source-screen research coverage` in the current bootstrap compiler is:

```text
(resolved pairs + source-screened unresolved pairs) / total pairs
```

This metric records whether at least one completed source-family screen or resolved determination exists. It is not protocol completion. The target event model will additionally report protocol-complete research coverage from explicit pair outcomes such as `reviewed-evidence-found` and `reviewed-no-qualifying-evidence` with `scope_complete: true`. `needs-followup`, `blocked`, partial runs, and inferred scope do not count as protocol complete.

Also report survey, freshness, and review distributions. Do not create one blended progress percentage. A pair may be researched but unknown, determined but stale, or supported by an unreviewed assertion. Those differences must remain visible.

For Alabama parity, determination coverage starts from `15133 / 167768 = 9.02%`. Legacy known compatibility coverage starts from `15141 / 167768 = 9.02%` and includes the `8` survey non-detection pairs. The generated bootstrap source-screen research baseline is `110721 / 167768 = 66.00%`, consisting of `15133` present, `8` not detected, and `95580` researched-unresolved pairs. Do not relabel that value as protocol completion.

## Local SQLite Query Index

`.cache/research/isitusa.sqlite` is rebuilt from the registry, ledgers, receipts, outcomes, and compiled truth. It exists for local filtering, joins, gap selection, conflict review, and agent batching.

Minimum tables or views should include:

- sources
- runs
- evidence assertions
- reviews and retractions
- rejections
- research outcomes
- compiled county-species axes
- coverage metrics

The index is disposable. Never edit it to correct data, commit it, deploy it, or read it from a production route. A clean rebuild must reproduce the same query-visible rows for identical inputs.

## Static Public Projections

The projection builder reads generated truth, not SQLite mutations. It writes one state summary and one file per county.

State projections include denominator, axis distributions, source freshness summary, generated `as_of` date, schema version, and county projection references.

County projections include county identity, species compatibility status, separate axis values needed by the UI, stable public source references, and concise caveats. They exclude raw artifacts, rejection details, actor identifiers, internal notes, local paths, and secrets.

The Next.js build consumes only committed static projections. No public route may query source APIs or open the local SQLite index.

## EDDMapS Compatibility Caveat

The existing `npm run merge:eddmaps-county-data` command is a bounded merge for cases where a full live source-family rebuild is impractical. It reads `src/data/source/eddmaps-snapshot.json` and unions EDDMapS counties into `src/data/source/county-presence-snapshot.json` while preserving other coverage.

The combined legacy snapshot stores county FIPS at the species level and source references separately. It cannot prove which source contributed each county row. Therefore the bounded merge cannot safely remove a county row that may have existed only in an older EDDMapS snapshot. It is additive and partial, not a full synchronized replacement. It cannot support absence, non-detection, full-refresh, or source-exhaustiveness claims.

During migration, any run that uses this path must record `bounded_additive_merge: true` and the caveat above in its receipt. The target ledger removes this ambiguity by attributing every assertion to a source record and run.

## Commands

### Existing Compatibility Commands

These commands exist today and may write tracked legacy artifacts:

```bash
cd "/Users/ocean/Code/Project Isitusa"
npm run import:eddmaps
npm run merge:eddmaps-county-data
npm run import:county-data
npm run prepare:data
npm run build:county-matrix -- AL
npm run check:data-integrity
npm run typecheck
npm run build
```

When source inputs change, `npm run prepare:data` must run before `npm run build:county-matrix -- AL` so the matrix reads the updated generated presence data.

Reverify Alabama counts without editing files:

```bash
node -e "const m=require('./docs/county-coverage/states/AL.json'); console.log(JSON.stringify(m.summary,null,2))"
```

### Implemented Research Bootstrap Commands

These commands exist and write tracked research artifacts except for the ignored SQLite index:

```bash
npm run research:migrate
npm run research:compile
npm run research:index
npm run research:refresh
npm run check:research-integrity
npm run validate:data
```

`research:migrate` reconstructs the migration ledger from current versioned compatibility inputs, preserves exact matrix parity, and writes deferred snapshot positives to `migration-candidates.json`. It is a bootstrap migration command, not the final append-only source-run interface.

### Reserved Research Command Interface

These commands are the required future interface. Only `research:compile` and `research:index` have bootstrap implementations, and the current compiler does not yet accept `--as-of`:

```bash
npm run research:run -- --source <source-id> --state AL --species-set <set-id>
npm run research:compile -- --as-of <YYYY-MM-DD>
npm run research:index
npm run research:project -- --state AL
npm run research:verify -- --state AL --as-of <YYYY-MM-DD>
```

`research:verify` should validate schemas and hashes, rebuild truth and SQLite, rebuild projections, rerun the compiler to prove byte stability, and print axis-specific before, after, and net metrics.

## Migration Sequence

1. Completed bootstrap: add the source registry, draft protocols, initial types, and adapter contract.
2. Completed bootstrap: migrate accepted legacy assertions with exact matrix parity and explicit legacy fallback lineage.
3. Completed bootstrap: defer 176 distinct GBIF or iDigBio positives that are not in the current matrix instead of silently promoting them.
4. Completed bootstrap: compile Alabama status axes, source-screen state, queue, and static county shards.
5. Completed bootstrap: build the disposable SQLite index and research integrity gate.
6. Completed bootstrap: add the public research control center without production source API or SQLite access.
7. Next: add schemas, review events, retractions, superseding events, rejections, and immutable detailed per-run receipts.
8. Next: move source families one at a time to registered parameterized adapters and explicit pair outcomes.
9. Next: review migration candidates through the source-family workflow, then compile accepted changes with exact before, after, and net reporting.
10. Retire direct legacy truth edits only after adapter coverage, deterministic `as_of` rebuilds, and all acceptance gates pass.

## Acceptance Gates

The new operating model is ready for production only when:

- no agent or importer writes compiled truth directly
- every published determination traces to assertion, review, source, run, and receipt
- all negative statuses pass explicit negative evidence validation
- missing rows compile to unknown and unassessed
- research and determination coverage are reported separately
- unresolved present versus absent conflicts fail compilation
- two clean compiler runs with identical inputs and `as_of` produce identical bytes
- SQLite can be deleted and rebuilt without data loss
- public projections contain no internal-only fields
- the production Next.js build performs no source API or SQLite access
- Alabama parity differences from the reverified baseline are fully explained
