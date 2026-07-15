# County-Species Evidence Research

## Purpose

This is the canonical operating guide for county-species research. Use it with `AGENTS.md` and `docs/architecture/evidence-research-system.md`.

Research produces auditable inputs for a deterministic compiler. It does not edit truth directly. A useful research result can be accepted evidence, a documented rejection, a completed no-qualifying-evidence outcome, or a blocked outcome with a precise reason.

## Current National Operating Model

The national operating model implemented on 2026-07-15 has one long-lived MAIN integration owner. MAIN alone may modify, merge, commit, push, regenerate shared projections, or deploy `main`. Every bounded source, state, evidence-review, or infrastructure worker must use an isolated `codex/*` branch and worktree with a machine-readable lease under `ops/national-research/`. Workers may commit only to their leased branches. They may not modify shared schemas or skills, generate shared projections, merge, push `main`, or deploy.

MAIN owns job planning, overlap checks, lease recovery, worker manifest review, integration, shared generation, release verification, and progress reporting. Current durable state is recorded in:

- `ops/national-research/jobs.json`
- `ops/national-research/leases.json`
- `ops/national-research/integration-queue.json`
- `ops/national-research/dashboard.json`
- `ops/national-research/readiness-dashboard.json`
- `ops/national-research/evaluations/`

The candidate local skills under `.agents/skills/` are not approved for broad dispatch. Their third and final bounded refinement cycle found that a blind real-pilot receipt was invalid under the repository receipt schema even though the candidate worker validator accepted it. Preserve the evaluation evidence and keep broad dispatch disabled until a later skill version passes every safety and schema gate.

Current national scope is explicit in `state-registry.json`, `county-equivalent-registry.json`, `state-research-config.json`, and `state-applicability/`. County routing is exact text-to-registry matching. Missing, retired, successor, or coordinate-only geography is rejected or blocked unless a separately reviewed geography policy is introduced.

## Before Starting

Work only in the canonical checkout and inspect concurrent work:

```bash
cd "/Users/ocean/Code/Project Isitusa"
git status --short --branch
git log -1 --oneline
```

Read:

1. `AGENTS.md`
2. `docs/architecture/evidence-research-system.md`
3. `docs/source-inventory.md`
4. the relevant state file in `docs/county-audit/states/`
5. the relevant state matrix in `docs/county-coverage/states/`

Do not revert, overwrite, stage, or reformat unrelated work. Historical audit reports are evidence of prior work, not mutable current-state dashboards.

## Choose A Bounded Work Unit

Every run needs an explicit scope. Prefer one source family and a small, reviewable state, county, species, or denominator tranche.

Record before acquisition:

- source ID or proposed source ID
- state and county scope
- species IDs or versioned species-set ID
- date range or snapshot ID
- target evidence kinds
- source filters and exclusions
- expected negative semantics, if any
- completion rule
- rerun command

Do not describe a run as statewide, complete, exhaustive, or refreshed unless its parameters and receipt support that claim.

## Source Qualification

Prefer official agency, university, museum, herbarium, land-grant, regulatory, or similarly attributable public sources. Community observation and aggregator sources can be useful when their authority and limitations are preserved.

Before accepting a source, determine:

1. Who publishes it and whether the source is attributable.
2. Whether it exposes stable records or only a narrative page.
3. Whether taxon identity is exact, mapped by a reviewed alias, or ambiguous.
4. Whether geography is explicit county data or can be resolved unambiguously from coordinates.
5. Whether the source supports occurrence, determination, survey, absence, or only research context.
6. Whether dates, effort, status fields, and record identifiers are available.
7. Whether licensing and terms allow retained artifacts and public derived data.
8. How often the source should be refreshed.
9. What known caveats must follow every accepted record.

Discovery does not equal adoption. A source may be useful for research and still fail the publication gate.

## Current Foundation

The first implementation layer uses:

- `src/data/research/source-registry.json`
- `src/data/research/research-protocols.json`
- `src/lib/research/types.ts`
- `src/lib/research/source-adapter.ts`
- `src/data/research/evidence-assertions.ndjson`
- `src/data/research/research-runs.json`
- `src/data/research/migration-report.json`
- `src/data/research/migration-candidates.json`
- `src/data/research/schemas/*.schema.json`
- `src/data/research/runs/<run-id>/`
- `scripts/migrate-research-ledger.ts`
- `scripts/compile-research-index.ts`
- `scripts/check-research-integrity.ts`
- `scripts/research/run-source.ts`
- `scripts/research/adapters/gbif-preserved-specimens.ts`
- `scripts/research/adapters/idigbio-preserved-specimens.ts`
- `scripts/build-research-db.ts`

Inspect and extend these files rather than creating a parallel model. The current event layer supports immutable initial assertions, reviews, rejections, pair outcomes, receipts, later review events, exact state-scoped compilation, deterministic static projections, and explicit protocol cells. General source-specific freshness policy and reviewer tooling remain incomplete. The architecture document controls acceptance when an early type or field name compresses those concerns.

The Alabama checkpoint freshly verified on 2026-07-15 contains `30291` evidence records, `329` rejections, `113` raw outcomes across `110` distinct pairs, `26` research runs, and `29` registered sources. Across `167768` pairs it compiles to `15222` verified present, `0` verified absent, `8` not detected, `95491` researched unresolved, and `57047` not researched. Research, compatibility, `presence.json`, `explorer-presence.json`, and the normal county experience agree on those reviewed present determinations.

The current national v1 topology has `51` state or district jurisdictions and `3144` active county equivalents. Alaska, Arizona, and Arkansas have bounded research-only projections for their explicit pilot species. Those pilot projections do not publish to the normal compatibility experience and are not state certifications.

The Alabama deferred queue currently contains `66` distinct pairs and `199` source assertions according to the dated 2026-07-15 handoff. Reverify those counts from generated queue inputs before each run. Candidates remain candidates until a registered source run produces reviewable evidence or an honest pair outcome.

## Source Registration

Under the target model, do not run an unregistered source adapter. Add or review the entry in `src/data/research/source-registry.json`, validate it against the source schema, and include the registry hash in the run receipt. Category-level screening protocols live in `src/data/research/research-protocols.json`.

The registry is implemented. Record source details in `docs/source-inventory.md` only when the task explicitly includes historical inventory maintenance. The inventory is not runtime authority.

A registry entry must state which claims the source can and cannot emit. Common capability limits include:

- occurrence evidence only
- regulatory county evidence, not specimen evidence
- survey detection and non-detection with effort metadata
- narrative context only
- no absence support
- no countywide completeness claim

## Adapter Rules

Use a registered adapter from `scripts/research/adapters/<adapter-id>.ts`. Pass scope as parameters. Do not add hidden one-off target lists or hard-coded county exceptions without putting them in versioned parameters or a reviewed mapping file.

An adapter may:

- fetch or read source artifacts
- validate transport and archive signatures
- normalize source records
- resolve reviewed taxon and county mappings
- emit evidence candidates
- emit rejection records
- emit pair outcomes
- write a source-run receipt

An adapter may not:

- edit `src/data/generated/research/<STATE>/truth.ndjson`
- edit public projections
- edit the SQLite index as authority
- infer absence from missing records
- silently discard candidates that reached a substantive filter
- broaden point, plot, route, or survey-area evidence into countywide claims

## Run Workflow

The implemented GBIF and iDigBio commands accept either the next bounded candidate count or explicit deferred pair keys:

```bash
npm run research:run -- --source gbif-preserved-specimens --state AL --candidate-limit 5
npm run research:run -- --source gbif-preserved-specimens --state AL --pairs <FIPS:species-id,...>
npm run research:run -- --source idigbio-preserved-specimens --state AL --candidate-limit 5
npm run research:run -- --source idigbio-preserved-specimens --state AL --pairs <FIPS:species-id,...>
npm run research:acquire:usgs-nas-national -- --version <archive-version> --started-at <ISO-8601-UTC>
npm run research:partition:usgs-nas-national -- --acquisition <acquisition-id> --plan <plan-id> --states <STATE,...> --recorded-at <ISO-8601-UTC>
```

The iDigBio adapter screens the frozen historical search index using stable UUID pagination. Publication requires exact target agreement across normalized and provider taxon names plus explicit indexed state and current county-equivalent text. Provider county text must agree when present. Coordinates are retained for lineage but never used to fill a missing county. The iDigBio portal reports that its search index was frozen on 2026-05-08; treat it as a historical source until current availability and freshness are explicitly reverified.

### Versioned National Archive Workflow

Acquire a national dataset once when the publisher exposes a versioned archive, then partition the committed bytes locally. MAIN runs both phases sequentially from clean committed checkpoints:

```bash
npm run research:acquire:usgs-nas-national -- --version 1.344 --started-at <ISO-8601-UTC>
git add src/data/research/national-acquisitions/<acquisition-id>
git commit -m "Acquire USGS NAS national archive v1.344"
npm run research:partition:usgs-nas-national -- --acquisition <acquisition-id> --plan usgs-nas-pilot-v1 --states AK,AR,AZ --recorded-at <ISO-8601-UTC>
```

The official USGS NAS IPT resource was reverified on 2026-07-15 at archive version `1.344`, publication date `2026-05-31`, and `721752` Darwin Core occurrence rows under `CC0-1.0`. The legacy compatibility snapshot still cites archive version `1.331`. That older citation remains dated bootstrap lineage and is not evidence that the current national archive is `1.331`.

The acquisition receipt pins the canonical archive URL, clean code commit, input hashes, byte count, SHA-256, archive entries, Darwin Core header, publication date, row count, requests, retries, and resumable byte-range behavior. It retains the exact archive once under `src/data/research/national-acquisitions/`. A partition run references that archive and receipt by hash rather than copying raw rows into each state run.

The current bounded plan accepts only explicit `collected` or `established` NAS occurrence statuses as positive occurrence evidence. Every other selected row is rejected with a counted reason. Exact state and active county-equivalent text are mandatory; coordinates do not fill missing or retired geography. A complete archive screen may emit `no-qualifying-evidence` and move a pair onto the researched axis, but it cannot emit verified absence or not detected.

The public GBIF occurrence search API remains suitable for bounded adapter work, but it is not accepted as a complete national snapshot because ordinary search results use mutable offset paging. A future national GBIF lane must use a versioned or authenticated download receipt with complete artifact lineage rather than claiming snapshot completeness from search pagination.

For each run:

1. Capture clean starting status and current commit.
2. Resolve the source entry and parameter schema.
3. Freeze normalized parameters and calculate the parameter hash.
4. Acquire artifacts without overwriting a known-good cache on failure.
5. Record URLs, response metadata, byte counts, and content hashes.
6. Normalize candidates with stable source locators.
7. Emit accepted assertions and explicit rejection records.
8. Emit one pair outcome for each pair whose research scope was actually completed.
9. Write the receipt as `partial`, `failed`, or `complete` based on actual scope.
10. Validate output schemas and hashes.
11. Review the diff before compilation.

A successful process exit does not make a run complete. Completion is a data claim and must be supported by the receipt and pair outcomes.

The runner refuses acquisition unless the worktree and registered acquisition inputs match the captured commit. It rechecks HEAD and the input bytes after network activity, validates record schemas, IDs, references, counts, and hashes in memory, then verifies staged bytes before the immutable directory is renamed into place. Identical accepted source-record claims from later runs remain preserved as immutable events but collapse to one active projection row. A changed payload for the same active source-record claim requires an explicit superseding or retraction event.

## Evidence Acceptance

An evidence assertion must answer all of these:

- Which canonical species is supported?
- Which exact county is supported?
- What did the source explicitly claim or record?
- What evidence kind is this?
- When did the event, observation, survey, regulation, or publication apply?
- Which source record and artifact support it?
- How were taxon and geography matched?
- What caveats limit the claim?
- Which run produced the assertion?
- What review gate must it pass before publication?

If any identity or geography step is ambiguous, reject or hold for follow-up. Do not choose the most convenient match.

## Explicit Negative Evidence

Negative evidence has a higher burden than positive occurrence evidence.

### Verified Absent

Accept `verified-absent` only when an authoritative source explicitly states that the exact species is absent from the exact county for a defined time and scope. The source must support an absence claim, not merely omit the species.

These do not qualify:

- species missing from a county list
- no API records returned
- no specimens in a collection export
- no map points visible
- no search results found
- request failure or empty pagination
- county not covered by the source
- all considered candidates rejected

### Not Detected

Accept survey `not-detected` only when the record identifies the target, location, time, method or program, result semantics, and enough sampling scope to interpret the negative result.

Keep the claim at its true scale. Plot, trap, route, water sample, apiary, and survey-area non-detections are not countywide absence. Record the survey axis and scope even when the compatibility status becomes `not-detected`.

If verified presence and survey non-detection both exist, retain both. Presence controls the compatibility status while the survey history remains visible.

## Rejections

Write a rejection whenever a candidate was materially considered and failed an acceptance gate. Use a stable reason code and enough detail to prevent another researcher from repeating the same ambiguity.

Common examples:

- taxon is genus-level or maps to multiple catalog species
- county text is missing, contradictory, or resolves to multiple counties
- coordinates fall outside the requested state or outside all county polygons
- source context indicates cultivated, planted, captive, nursery, garden, arboretum, landscaped, or lab-colony material when policy excludes it
- occurrence status is failed or source record is internally contradictory
- candidate is a duplicate of an existing content-derived assertion
- source exposes no effort semantics needed for a non-detection claim

A rejection is not a completed pair review by itself. Pair completion requires an explicit outcome with `scope_complete: true`.

## Pair Outcomes And Research Coverage

Write pair outcomes to `src/data/research/runs/<run-id>/outcomes.ndjson` under the target model. Use:

- `evidence-found`
- `no-qualifying-evidence`
- `needs-followup`
- `blocked`

`no-qualifying-evidence` means the declared source and parameter scope was completed and produced no publishable evidence for the pair. It does not mean absent, not detected, globally researched, or permanently resolved.

Determination coverage counts only publishable verified-present and verified-absent pairs. Survey non-detection remains on the survey axis. The legacy compatibility known metric may include not-detected, but it must not be called determination coverage.

The bootstrap source-screen research metric counts a pair when it has a resolved status or its species was included in at least one completed statewide source-family screen. It does not mean the full protocol is complete. The implemented protocol-cell projection separately measures explicit source-species applicability and current completed pair outcomes. Report each metric with its definition and denominator.

## Review Workflow

Assertions start below the publication gate. Review appends `evidence.reviewed` events instead of editing assertions.

The reviewer checks:

1. Source registry capability.
2. Exact taxon mapping.
3. Exact county mapping.
4. Claim type and evidence kind.
5. Temporal and survey scope.
6. Caveats and source wording.
7. Duplicate, contradiction, and prior-evidence context.
8. Freshness and claim persistence policy.
9. Receipt, artifact, and content hashes.

Manual browser findings require human approval by default. Registered deterministic adapters may publish at machine validation only when the source registry explicitly permits it.

Corrections append a retraction or superseding event. Never delete or rewrite the original assertion or review.

## Compilation And Verification

Compilation is a separate step from research and must not access the network. The implemented interface is:

```bash
npm run research:migrate
npm run research:compile -- --state <STATE> --as-of <YYYY-MM-DD>
npm run research:index
npm run research:refresh -- --state <STATE> --as-of <YYYY-MM-DD>
npm run research:verify -- --state <STATE> --as-of <YYYY-MM-DD>
npm run check:research-integrity
npm run check:state-research-projections
npm run check:national-research-config
npm run build:national-readiness -- --as-of <YYYY-MM-DD>
```

`research:compile` is the implemented state projection command. Alabama is authoritative and may update compatibility outputs. Alaska, Arizona, and Arkansas are research-only and the compiler must not alter compatibility, `presence.json`, or `explorer-presence.json` for them. `research:verify` proves byte stability across two offline compiler runs for one explicit state and as-of date. Run it with the research integrity, state projection, national configuration, readiness, and disposable-index gates.

During migration, use the current compatibility commands when the task calls for legacy generation:

```bash
npm run prepare:data
npm run build:county-matrix -- AL
npm run check:data-integrity
npm run check:research-integrity
npm run typecheck
npm run build
```

`npm run prepare:data` must precede the Alabama matrix build after source presence changes.

Reverify the generated Alabama summary with:

```bash
node -e "const m=require('./docs/county-coverage/states/AL.json'); console.log(JSON.stringify(m.summary,null,2))"
```

Always report baseline, post-change, and net counts. Gross source rows are not the same as net compiled determination changes.

## EDDMapS Bounded Merge

The legacy command:

```bash
npm run merge:eddmaps-county-data
```

is additive and partial. It unions the current EDDMapS snapshot into a combined species-level county list that cannot attribute each county row to a single source. It cannot safely remove stale EDDMapS-only county rows and cannot support absence, non-detection, or full-refresh claims.

Any receipt or handoff that uses this compatibility path must say that it was a bounded additive merge and must not describe unrelated source families as refreshed.

## Agent Output Contract

Before any worker starts, MAIN must create a non-overlapping lease with the job ID, worker type, state or source-family scope, taxa or pair scope, branch, worktree, base SHA, permitted and prohibited paths, pinned skill versions and hashes, expected outputs, retry policy, expiration or recovery state, and completion criteria.

A worker research task is complete only when its branch contains the leased outputs and a machine-readable completion manifest reporting:

- lease, branch, worktree, base SHA, pinned skill versions and hashes, and worker commit SHA
- exact source parameters and retained artifacts
- evidence assertion events for accepted candidates
- rejection events for materially rejected candidates
- pair outcomes for completed or unresolved scope
- one immutable source-run receipt
- artifact hashes and retention status
- review state, with no false publication claim
- exact baseline, final, and net counts
- exact verification commands and results
- blocked items, caveats, partial scope, unresolved contradictions, and remaining work

The worker does not edit truth, metrics, SQLite, shared schemas, skills, or public projections and does not merge, push `main`, or deploy. MAIN reviews the manifest and diff, runs integration checks, regenerates shared outputs, and publishes centrally.

## Handoff Template

Use this shape in a continuation note:

```text
CONFIRMED
- canonical repo and current commit
- dirty files present before work
- source ID, adapter version, run ID, and exact parameters
- receipt status and output hashes
- accepted, rejected, duplicate, error, and pair-outcome counts
- baseline, post-change, and net axis metrics
- commands that actually ran and their result

INFERRED
- interpretations that are plausible but not directly stated by a source

UNKNOWN / NOT CONFIRMED
- unfinished review, blocked source access, unresolved taxon or geography, unrun checks

NEXT
- exact file, command, and smallest safe next action
```

Generated counts must be reverified in the next task. Never copy an old count forward as current without reading freshly generated output.
