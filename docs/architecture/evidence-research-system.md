# Evidence Research System

## Status

This document defines the operating model for county-species evidence research. The bootstrap ledger, immutable run model, state-scoped compiler, SQLite index, static research projections, explicit protocol cells, national geography registries, orchestration registries, and research control center are implemented. Paths marked `Required` remain acceptance work and must not be presented as complete.

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

## Exclusive MAIN And Worker Boundary

One long-lived MAIN integration task exclusively owns `main`. MAIN alone plans jobs, allocates leases, edits shared architecture or skills, reviews worker results, integrates commits, runs shared generation, pushes, deploys, and verifies releases.

Every bounded source, state, evidence-review, or infrastructure worker must use an isolated `codex/*` branch and worktree plus a non-overlapping machine-readable lease. A lease pins the base SHA, branch, worktree, state or source scope, taxa or pair scope, permitted and prohibited paths, skill versions and hashes, expected outputs, retry policy, expiration state, and completion criteria. Workers may commit only to their assigned branches. They may not merge, push `main`, deploy, edit shared schemas or skills, or regenerate shared public projections. Shared requirements become proposals or blockers for MAIN.

Jobs, leases, integration decisions, readiness, evaluations, and recovery state are durable artifacts under `ops/national-research/`. Chat history is not operational authority.

The first three 2026-07-15 skill evaluation cycles remain failed historical evidence. A bounded validator-recovery evaluation then consolidated worker validation onto the canonical immutable-run schemas and semantic validator. The first post-freeze recovery also remains rejected because it rewrote acquisition code lineage. The repaired suite passed `97/97` regression cases with zero critical violations and two accepted lineage-preserving worker integrations. The frozen version is `frozen-postfreeze-lineage-2026-07-26-r2` at commit `52da0a7377e03ab7c0d9ff49e761a760d4bd73f1`. Its orchestrator hash is `9f934116bc4f1ad80b3b61d805f4ad4c0070773ed3040c28e96098c74d888757`, its worker hash is `1f63422c4d55e7f6c712ca08db60ab39d8824d600ff78ea160ac7283734d5151`, and the complete pin contract is recorded in `ops/national-research/receipts/skill-freezes/isitusa-national-skills-postfreeze-lineage-2026-07-26-r2.json`.

## Verified Checkpoints

The current system builds presence from `src/data/generated/presence.json`, non-presence compatibility statuses from `src/data/source/county-species-status-overrides.ts`, and state matrix reports with `scripts/build-state-coverage-matrix.ts`.

The Alabama table below is historical migration context verified from `docs/county-coverage/states/AL.md` on 2026-07-14 at commit `ae9d573`. It is not current authority:

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

The current Alabama parity checkpoint freshly verified with explicit as-of `2026-07-28` is:

| Metric | Count |
| --- | ---: |
| Registered sources | 29 |
| Research runs | 33 |
| Evidence records | 31531 |
| Rejections | 1440 |
| Raw pair outcomes | 3528 |
| Distinct outcome pairs | 3392 |
| Verified present | 15293 |
| Verified absent | 0 |
| Survey not detected | 8 |
| Researched unresolved | 95615 |
| Not researched | 56852 |
| Conflicts | 0 |

Research, compatibility, `presence.json`, `explorer-presence.json`, and the normal county experience agree on the `15293` reviewed Alabama present pairs. This preserves the prior parity repair and the `8` not-detected survey records.

The current v1 geography registry contains `51` state or district jurisdictions and `3144` active county equivalents. Alaska has `30` current county equivalents, including `02063` and `02066`; retired `02261` is lineage only. Connecticut has `9` current planning regions and retains its `8` former counties only as retired lineage. All `51` jurisdictions have deterministic generated research projections. Alabama is compatibility-authoritative. The other `50` remain research-only and are not normal compatibility publication or state certification.

The national projection checkpoint at explicit as-of `2026-07-28` contains a bounded acquisition scope of `5389` state-species entries and `340873` county-species pairs: `41781` verified present, `0` verified absent, `8` not detected, `237118` researched unresolved, and `61966` not researched. It contains `58279` evidence records, `4492` rejection events, `171383` explicit outcome pairs, and `0` conflicts.

The complete catalog denominator is different: `2504` species across `51` jurisdictions creates `127704` state-species decisions, and `2504` species across `3144` county equivalents creates `7872576` county-species pairs. The sparse model stores explicit acquisition rows plus state-applicability overrides and resolves missing applicable or unknown catalog pairs as `not-researched`. At this checkpoint, state applicability is `2772` applicable, `0` not applicable, `124932` unknown, and `0` blocked. Accepted reviewed county presence derives `1821` of the applicable decisions, while `951` are explicit overrides. State-species research accounting separately contains `1683` researched-unresolved, `94` researched-blocked, and `123155` untouched decisions outside the applicable category. Full pair status resolution is `41781` verified present, `0` verified absent, `8` not detected, `237118` researched unresolved, and `7593669` not researched. Bounded acquisition coverage and full-catalog certification coverage are always reported separately.

Official state applicability sources use a registry separate from county evidence sources. Each immutable review directory contains one declared hashed artifact and one schema-validated review record. The deterministic `research:apply:state-lists` command accepts only exact canonical catalog binomials, rejects missing or extra files and descriptor mismatches, and adds state-level applicability bases without creating county evidence, absence, non-detection, or not-applicable decisions. The first family retains Alabama, Alaska, and Arkansas artifacts, accepts `49` exact events, preserves `22` ambiguous or unmatched rows as blocked, and records Arizona as an acquisition blocker because the official provider returned challenge pages.

## System Boundary

```text
registered source + parameters
  -> source adapter
  -> immutable national acquisition or bounded source artifact
  -> deterministic state and county-equivalent partition when applicable
  -> immutable source-run receipt
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
| `src/data/research/research-protocols.json` | Current | Explicit source-species applicability protocols |
| `src/data/research/state-registry.json` | Current | State and district jurisdiction registry |
| `src/data/research/county-equivalent-registry.json` | Current | Active and retired county-equivalent geography registry |
| `src/data/research/state-research-config.json` | Current | State projection and species-scope configuration |
| `src/data/research/state-applicability/<STATE>.json` | Current for configured pilots | Explicit pilot species applicability |
| `src/data/research/evidence-assertions.ndjson` | Current bootstrap | Deterministically reconstructed compatibility evidence ledger |
| `src/data/research/research-runs.json` | Current bootstrap | Combined migration run records, not final immutable per-run receipts |
| `src/data/research/migration-candidates.json` | Current bootstrap | Deferred migration candidates for review |
| `src/data/research/migration-report.json` | Current bootstrap | Legacy migration summary |
| `src/data/research/schemas/*.schema.json` | Current | Schemas for bootstrap records, registry, events, receipts, outcomes, parameters, and projections |
| `src/data/research/review-events.ndjson` | Current | Append-only later review, retraction, and superseding events |
| `src/data/research/rejections.ndjson` | Current | Append-only later rejected candidate records |
| `src/data/research/runs/<run-id>/receipt.json` | Current | Immutable detailed source-run receipt |
| `src/data/research/runs/<run-id>/*.ndjson` | Current | Immutable initial assertions, reviews, rejections, and pair outcomes |
| `src/data/research/runs/<run-id>/artifacts/*` | Current when allowed | Raw or normalized source artifacts subject to retention and licensing |
| `src/data/research/national-acquisitions/<acquisition-id>/` | Current for versioned national sources | One immutable national archive and acquisition receipt reused by state partitions |
| `src/data/research/national-acquisition-plans/*.json` | Current | Versioned state-species partition plans and positive-status gates |
| `src/lib/research/types.ts` | Current | Research domain, event, receipt, review, rejection, and outcome types |
| `src/lib/research/source-adapter.ts` | Current | Runner-owned parameterized adapter contract |
| `scripts/migrate-research-ledger.ts` | Current bootstrap | Deterministic legacy evidence migration |
| `scripts/compile-research-index.ts` | Current | State-scoped event compiler and static projection builder with explicit `--state` and `--as-of` |
| `scripts/build-research-db.ts` | Current | Disposable SQLite index builder |
| `scripts/check-research-integrity.ts` | Current | Research parity and projection integrity checks |
| `scripts/research/adapters/gbif-preserved-specimens.ts` | Current | Registered GBIF preserved-specimen adapter |
| `scripts/research/adapters/idigbio-preserved-specimens.ts` | Current | Registered iDigBio preserved-specimen adapter for the frozen historical index |
| `scripts/research/adapters/usgs-nas-archive.ts` | Current | Deterministic replay of exact state, taxon, county-equivalent, and positive-status NAS rows |
| `scripts/research/run-national-usgs-nas-acquisition.ts` | Current | Resumable, version-pinned acquisition of one official NAS archive |
| `scripts/research/partition-national-usgs-nas-acquisition.ts` | Current | Single-pass local partitioning into bounded immutable state runs |
| `scripts/research/adapters/<adapter-id>.ts` | Required per source | Additional parameterized source adapters |
| `scripts/research/run-source.ts` | Current for configured GBIF and iDigBio scopes | Registered source-run orchestrator |
| `scripts/build-national-readiness-dashboard.ts` | Current | Separate readiness gates, protocol metrics, job metrics, and forecast |
| `ops/national-research/*.json` | Current | Jobs, leases, integration queue, dashboard, readiness, and evaluations |
| `src/data/generated/research/<STATE>/summary.json` | Current for configured states | Generated build-time state summary |
| `.cache/research/isitusa.sqlite` | Current | Disposable local query index, never authoritative |
| `public/generated/research/<STATE>/summary.json` | Current for configured states | Static public research state projection |
| `public/generated/research/<STATE>/counties/<FIPS>.json` | Current for configured states | Static public research county projection |

`.cache/` is ignored. Verify the current ignore diff before changing it and do not overwrite concurrent ignore-file edits.

The architecture remains the acceptance contract where implementation is incomplete. Pair freshness now uses observation dates rather than retrieval or review activity, and the source registry can pin a fixed data horizon for historical snapshots. Current gaps include completing source-by-source freshness audits, a reviewer command for later human events, additional registered source-family adapters, and enough completed protocol cells for certification.

`app/research/page.tsx` remains a static route. `src/components/research-control-center.tsx` fetches committed state summaries and county shards from `public/generated/research/<STATE>/` so large queues are not embedded in initial HTML. Alabama is labeled as the certification baseline. Alaska, Arizona, and Arkansas are labeled as bounded research-only pilots. Do not claim a route or state is complete until generated input, build, normal county behavior, and route behavior are verified together.

## Append-Only Evidence Events

`src/data/research/evidence-assertions.ndjson` remains a reproducible bootstrap ledger and can be reconstructed by migration. New assertion authority lives inside immutable run directories. Initial reviews and rejections live beside their run assertions. Later review, retraction, superseding, and rejection events append to the top-level event ledgers. One JSON object occupies one line. Completed run files and appended later events are never edited, reordered, or deleted.

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

Acquisition event IDs remain run scoped so every immutable run preserves its own lineage. The compiler derives a stable source-record claim identity from source, record ID, species, county, claim type, and normalized payload hash. Identical accepted claims from later runs collapse to one active projection row while all immutable events remain available for audit. A changed payload for the same active source-record claim must be resolved by an explicit superseding or retraction event before publication can continue.

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

## National Acquisition And Partitioning

A national source is acquired once when its publisher exposes a stable versioned artifact. The acquisition and state partition are separate committed phases. The acquisition receipt pins code, parameters, upstream response metadata, artifact bytes and hash, archive structure, schema header, publication date, row count, license, retry history, and resume behavior. The repository commit containing that receipt and artifact becomes the ancestor of every dependent state-run receipt.

The USGS NAS implementation uses official IPT archive version `1.344`, published `2026-05-31`, with `721752` rows and a `CC0-1.0` license as reverified on 2026-07-15. The legacy compatibility snapshot still cites `1.331`; both lineages remain explicit. The national archive is retained once. Each state run stores only assertions, reviews, grouped rejections, pair outcomes, and a hash-pinned acquisition reference.

The first real national partition retained acquisition `20260531__usgs-nas-dwca-v1-344__563b13cbf2f8` and screened Alaska `myosotis-scorpioides`, Arkansas `daphnia-lumholtzi`, and Arizona `cyprinus-carpio`. One archive stream selected `4609` rows and produced `32` reviewed assertions, `13` grouped rejection events, `97` scope-complete outcomes, and `23` blocked outcomes. All state-specific network request counts were zero. Full integrity replay recomputed selected-row hashes and every assertion, review, rejection, and outcome from the retained archive. State compiler byte-stability passed for Alaska, Arkansas, and Arizona, and protected shared compatibility outputs did not change.

The centralized pilot evaluation is durable at `ops/national-research/evaluations/usgs-nas-pilot-2026-07-15.json`. Its forecast is explicitly limited to automated national-source-equivalent county screens at one measured end-to-end point estimate. The readiness artifact reports no statistical confidence interval and does not treat the result as a national certification forecast. The dated evaluation statement that `47` jurisdictions lacked applicability classification is superseded by the current configured count of `0`; state-specific, manual, blocked, freshness, integration, and production QA work remain separately unmeasured.

The second national implementation uses the Purdue University Research Repository AFPE v1.0 CC0 archive, acquisition `20240328__usfs-afpe-v1-0__ca1988d2f900`. It contains `3221` county rows and `93` DCA pest columns, with source data last updated in April 2023. Only `13` hash-pinned reviewed taxon mappings may publish. A value of `1` supports historical recorded-present evidence. A value of `0` completes only the declared source screen as no-qualifying-evidence and cannot support verified absence or not detected.

AFPE partitioning uses exact five-digit current FIPS as the primary geography identity and requires the raw county label to normalize consistently. A shared county name does not block an exact valid FIPS. Retired, abolished, superseded, missing, and unknown FIPS are rejected or blocked and are never reassigned automatically. The accepted partition emitted `40872` outcomes, `7642` reviewed assertions, `32983` no-qualifying-evidence outcomes, `247` blocked outcomes, and `481` rejection events across all `51` jurisdictions. A repeated partition created `0` new runs and matched all `51` committed run bundles exactly. The evaluation is `ops/national-research/evaluations/usfs-afpe-national-2026-07-26.json`.

AFPE v1.0 remains stale historical evidence and cannot satisfy current-source readiness. PURR metadata describes `89` pests while the published CSV and dictionary contain `93` DCA pest columns. The live AFPE v2 application is newer and volatile but has no equivalent hash-pinned CC0 snapshot manifest, so it was not substituted for the retained archive.

Partitioning streams the complete archive once for all selected screens. It requires exact canonical binomial agreement, exact state code, and exact active county-equivalent text. Missing, unknown, ambiguous, and retired geography is rejected. Coordinates are lineage only. Only explicit `collected` or `established` statuses pass the bounded positive-evidence gate. Archive silence and rejected rows can support a completed research outcome only when the declared screen completed; they never support absence or survey non-detection.

Mutable offset paging is not a national snapshot boundary. The public GBIF search API can support bounded adapter runs, but a national GBIF acquisition must use a versioned or authenticated complete download with an immutable receipt before it can claim national-source completion.

## Source-Run Receipts

The compatibility migration currently writes combined bootstrap records to `src/data/research/research-runs.json`. Those records support parity and source-screen migration, but they are not the final immutable receipt model.

Every new adapter run writes `src/data/research/runs/<run-id>/receipt.json`. The receipt is immutable after completion. A correction creates a new run that references the old run.

The first GBIF bootstrap run, `20260715T034832Z__gbif-preserved-specimens__090596ab4867`, was captured before the adapter and registry were committed. Its retained hashes are present in later history, but they cannot match its recorded commit. Integrity treats that single run ID as an explicit legacy lineage exception. New runs must match adapter and registry bytes at the exact receipt commit.

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

Certification metrics use the full catalog county-species denominator for the state. Bounded acquisition metrics use only their declared source scope and are labeled separately. A sparse default row is still part of the full denominator even when it is not materialized in a county JSON file.

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

This metric records whether at least one completed source-family screen or resolved determination exists. It is not protocol completion. The explicit protocol-cell projection separately reports applicable, not applicable, incomplete, complete, blocked, stale, and current source-species cells. Only complete current pair outcomes with `scope_complete: true` can complete an applicable cell. `needs-followup`, `blocked`, stale, partial runs, inferred scope, and source silence without a completed outcome do not count as protocol complete.

State-species applicability and source-species applicability are separate. Every catalog species has one state decision in every jurisdiction: `applicable`, `not-applicable`, `unknown`, or `blocked`. Accepted reviewed county presence establishes `applicable` for that state and species. `unknown` is not silently excluded. A source may be explicitly not applicable to an unknown state-species pair, and an exact source rule may screen an unknown pair without resolving its broader state applicability.

State-species research accounting is a separate axis. It distinguishes untouched, partially researched, fully researched unresolved, applicable, explicitly not applicable, and blocked scope. Certification requires every catalog species and its eligible county pairs to be researched or explicitly blocked. It does not require unsupported absence, presence, or not-applicable claims. A completed unresolved screen is valid research accounting, while an untouched species remains a certification blocker.

Also report survey, freshness, and review distributions. Do not create one blended progress percentage. A pair may be researched but unknown, determined but stale, or supported by an unreviewed assertion. Those differences must remain visible.

For the 2026-07-15 Alabama parity checkpoint, determination coverage starts from `15222 / 167768`; compatibility known coverage includes those determinations plus `8` survey non-detection pairs. Source-screen research coverage includes `15222` present, `8` not detected, and `95491` researched-unresolved pairs. The explicit Alabama protocol projection contains `22536` source-species cells: `14668` applicable and `7868` not applicable, with no applicable cell falsely marked complete during migration. Do not relabel source-screen coverage as protocol completion.

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
npm run prepare:data -- --as-of <YYYY-MM-DD>
npm run check:prepare-data-plan
npm run check:data-integrity
npm run typecheck
npm run build
```

`prepare:data` first rebuilds the legacy runtime base and then recompiles every state whose research configuration enables compatibility publication. This preserves reviewed research evidence in `presence.json`, `explorer-presence.json`, the compatibility matrix, and the normal county experience. The legacy matrix generator is blocked for compiler-owned states because it cannot reproduce the authoritative event projection.

Reverify Alabama counts without editing files:

```bash
node -e "const m=require('./docs/county-coverage/states/AL.json'); console.log(JSON.stringify(m.summary,null,2))"
```

### Implemented Research Commands

These commands exist and write tracked research artifacts except for the ignored SQLite index:

```bash
npm run research:migrate
npm run research:run -- --source gbif-preserved-specimens --state AL --candidate-limit <1-100>
npm run research:run -- --source idigbio-preserved-specimens --state AL --candidate-limit <1-100>
npm run research:acquire:usgs-nas-national -- --version <archive-version> --started-at <ISO-8601-UTC>
npm run research:partition:usgs-nas-national -- --acquisition <acquisition-id> --plan <plan-id> --states <STATE,...> --recorded-at <ISO-8601-UTC>
npm run research:compile -- --state <STATE> --as-of <YYYY-MM-DD>
npm run research:index
npm run research:index:state -- --state <STATE>
npm run research:refresh -- --state <STATE> --as-of <YYYY-MM-DD>
npm run research:verify -- --state <STATE> --as-of <YYYY-MM-DD>
npm run research:verify:all -- --as-of <YYYY-MM-DD>
npm run check:research-integrity
npm run check:state-research-projections
npm run check:national-research-config
npm run build:national-readiness -- --as-of <YYYY-MM-DD>
npm run validate:data
```

`research:migrate` reconstructs the migration ledger from current versioned compatibility inputs, preserves exact matrix parity, and writes deferred snapshot positives to `migration-candidates.json`. It is a bootstrap migration command, not the final append-only source-run interface.

`research:run` implements state-parameterized registered GBIF and frozen-index iDigBio preserved-specimen adapters. The USGS NAS acquisition command retains one versioned national archive, and its partition command streams that committed archive once for the selected state-species screens. `research:compile` consumes only runs matching the requested state. Alabama may update compatibility outputs; configured pilot states write research-only projections and cannot update shared compatibility outputs. `research:verify` runs two offline compilers for the same state and as-of date and fails if tracked projection bytes differ.

Run `check:research-integrity`, `check:state-research-projections`, `check:national-research-config`, `build:national-readiness`, `research:index`, and state-scoped `research:verify` together for schema, hash, state isolation, readiness, local index, publication-boundary, and byte-stability verification.

## Migration Sequence

1. Completed foundation: migrate accepted legacy assertions with explicit bootstrap lineage and preserve deferred source candidates without silently promoting them.
2. Completed foundation: add registered adapters, immutable runs, reviews, rejections, pair outcomes, exact as-of compilation, hash validation, byte stability, SQLite indexing, and static projections.
3. Completed parity dependency: make reviewed compiler output authoritative for Alabama research and compatibility publication while retaining separate survey non-detection records.
4. Completed national parameterization: add explicit state and county-equivalent registries, state applicability, state-scoped run selection, research-only pilot projections, and Alaska geography regressions.
5. Completed protocol foundation: replace implicit category completion with explicit source-species applicability cells and separate completeness, freshness, blocked, and priority metrics.
6. Completed orchestration foundation: add jobs, leases, manifests, integration queue, readiness dashboard, and adversarial validation.
7. Blocked skill gate: preserve the failed third-cycle candidate evaluation and prohibit broad dispatch.
8. Completed first national-source pilot: retain USGS NAS v1.344 once, partition it across Alaska, Arkansas, and Arizona, integrate three clean research-only projections, and preserve all blocked outcomes without negative inference.
9. Completed dated Alabama migration queue: registered GBIF and frozen-index iDigBio runs screened all `312` source assertions across `176` distinct pairs. The final projection contains `15293` present, `0` absent, `8` not detected, `95420` researched unresolved, and `57047` not researched pairs. Queue completion is not state certification.
10. Current constraint: the two-clean-integration threshold is met for integration safety, but the independent skill gate remains blocked. Broad worker dispatch and 5 to 10 concurrent states remain prohibited. MAIN continues bounded centralized work until an evaluated skill version passes and sustained machine capacity is sufficient.
11. Continuing: complete source-specific freshness audits, reviewer tooling, additional registered sources, and protocol screening.

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

## State Certification Gates

A state is ready for v1 certification only when all of these are true:

- public and research projections agree
- deferred candidates are resolved or explicitly blocked
- baseline research coverage is complete or has explicit blocked exceptions
- at least 90 percent of applicable protocol cells are complete
- regulated and high-priority species have 100 percent applicable protocol completion
- required current source families are processed and freshness is reported separately
- conflicts are zero or explicitly adjudicated
- outputs compile deterministically and pass data and research integrity
- normal county pages and research views pass desktop and mobile production QA

Source-screen coverage, known-pair coverage, protocol completion, determination coverage, survey non-detection, freshness, and conflicts remain separate metrics. No state is ready merely because one percentage is high.
