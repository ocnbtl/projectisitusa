# Next Chat Prompt

> SUPERSEDED FOR ORDINARY CONTINUATION as of 2026-07-15. Do not use this file to claim current counts, task ownership, worker scope, or permission to write `main`. Current authority is the canonical checkout, current generated artifacts, `AGENTS.md`, the architecture and research guides, and `ops/national-research/`. Use this historical prompt only when the user explicitly transfers exclusive MAIN ownership under the handoff policy. Before transfer, stop dispatch, integrate or close all work, record every lease, branch, worktree, commit, blocker, and deployment, and confirm that no merge, build, push, or deployment is active.

Latest superseding checkpoint: the centralized USGS NAS v1.344 national pilot is integrated into research-only Alaska, Arkansas, and Arizona projections with `32` reviewed present assertions, `65` researched-unresolved pairs, `13` grouped rejection events, `120` outcomes, and `23` blocked outcomes. Its machine-readable evaluation is `ops/national-research/evaluations/usgs-nas-pilot-2026-07-15.json`. The candidate worker skills remain blocked and unfrozen. This historical prompt still must not be used as a live handoff.

The content below is retained as historical provenance. Its Alabama-only objective, counts, commands, and implementation gaps are stale.

Copy everything below only for an explicitly authorized ownership transfer, then replace its dated state from current repository artifacts before acting.

## Prompt

Treat this prompt as the current operating context for Project Isitusa, but reverify volatile state from the canonical checkout before acting.

### Repository And Git

- Canonical repository: `/Users/ocean/Code/Project Isitusa`
- Legacy checkout: `/Users/ocean/Documents/Project Isitusa`. Never use it as source of truth.
- This prompt grants `main` access only after the user explicitly transfers exclusive MAIN ownership and current orchestration state proves that no other task owns or writes `main`.
- Every bounded worker uses an isolated `codex/*` branch and worktree plus a current non-overlapping machine-readable lease. Workers never merge, push `main`, deploy, modify shared schemas or skills, or regenerate shared public projections.
- Preserve concurrent user changes. Do not revert, overwrite, stage, or reformat unrelated edits.
- After proper evaluation, commit the scoped work and push `main` to GitHub.
- Verify the resulting Vercel production deployment and live route behavior.
- Current code, current git state, and freshly generated outputs override this dated prompt.
- Flag contradictions explicitly instead of smoothing them over.

### Objective

Historical objective, now superseded: continue the county-species evidence research system and use it to accelerate accurate Alabama coverage. The system must make every county-species pair easy to classify as:

- verified present
- verified absent
- not detected by a documented survey
- researched unresolved after at least one source-family screen
- not researched

Keep determination, survey, research, freshness, and conflict state separate. Unknown, unresolved, or missing never means absent.

The long-term goal is a repeatable nationwide process, but Alabama remains the current state. Prefer high-yield source-family runs over random county-by-county browsing. A useful run should screen many species or counties, preserve exact evidence lineage, and emit auditable results even when no qualifying evidence is found.

### Read First

Read these files in order:

1. `/Users/ocean/Code/Project Isitusa/AGENTS.md`
2. `/Users/ocean/Code/Project Isitusa/docs/architecture/evidence-research-system.md`
3. `/Users/ocean/Code/Project Isitusa/docs/research/README.md`
4. `/Users/ocean/Code/Project Isitusa/src/data/research/source-registry.json`
5. `/Users/ocean/Code/Project Isitusa/src/data/research/research-protocols.json`
6. `/Users/ocean/Code/Project Isitusa/src/data/research/migration-report.json`
7. `/Users/ocean/Code/Project Isitusa/src/data/research/migration-candidates.json`
8. `/Users/ocean/Code/Project Isitusa/src/data/generated/research/AL/summary.json`
9. `/Users/ocean/Code/Project Isitusa/scripts/migrate-research-ledger.ts`
10. `/Users/ocean/Code/Project Isitusa/scripts/compile-research-index.ts`
11. `/Users/ocean/Code/Project Isitusa/scripts/check-research-integrity.ts`
12. `/Users/ocean/Code/Project Isitusa/src/lib/research/types.ts`
13. `/Users/ocean/Code/Project Isitusa/src/lib/research/source-adapter.ts`
14. `/Users/ocean/Code/Project Isitusa/app/research/page.tsx`
15. `/Users/ocean/Code/Project Isitusa/src/components/research-control-center.tsx`
16. `/Users/ocean/Code/Project Isitusa/docs/source-inventory.md`

`docs/county-audit/**` and older county reports are historical provenance. Do not rewrite them to look current. `docs/county-coverage/states/AL.json` remains the compatibility matrix used for parity checks.

### Mandatory Startup Verification

Run before editing:

```bash
cd "/Users/ocean/Code/Project Isitusa"
git status --short --branch
git log -5 --oneline --decorate
node -e "const s=require('./src/data/generated/research/AL/summary.json'); console.log(JSON.stringify(s.summary,null,2))"
node -e "const r=require('./src/data/research/migration-report.json'); console.log(JSON.stringify(r,null,2))"
npm run check:research-integrity
```

Inspect every dirty file that overlaps your scope. Treat unrelated dirty files as user work. Do not clean or restore them.

### Confirmed Compiler Checkpoint

The architecture migration checkpoint generated on 2026-07-14 is:

- `2504` species
- `67` Alabama counties
- `167768` county-species pairs
- `15133` verified present
- `0` verified absent
- `8` not detected
- `95580` researched unresolved
- `57047` not researched
- `9.02%` determination coverage
- `66.00%` source-screen research coverage
- `0` present-versus-absence conflicts
- `30130` evidence records
- `15` research run records
- `29` registered sources
- `1558` legacy fallback positive pairs
- `176` distinct deferred positive candidates from the older GBIF and iDigBio preserved-specimen snapshots

Reverify every number before citing it. These are generated values, not permanent constants.

The compatibility matrix still reports `15141` legacy known pairs because it adds the `8` not-detected survey results to the `15133` determinations. Do not call `15141` determination coverage. Determination coverage counts verified present plus verified absent only.

The `66.00%` research figure means a pair is resolved or its species participated in at least one completed statewide source-family screen. It does not mean the full category protocol is complete, every reputable source was checked, or an unresolved species is absent.

### Implemented System

The repository now has:

- machine-readable source registry and draft category protocols
- research domain types and source-adapter contract
- deterministic compatibility migration into `src/data/research/evidence-assertions.ndjson`
- combined bootstrap run records in `src/data/research/research-runs.json`
- migration report and deferred candidate report
- deterministic Alabama compiler
- generated state summary in `src/data/generated/research/AL/summary.json`
- public summary and 67 public county shards under `public/generated/research/AL/`
- generated Alabama progress and priority queue under `docs/research/generated/`
- disposable local SQLite index at `.cache/research/isitusa.sqlite`
- research integrity gate
- public `/research` control center with county, source, and queue views
- dynamic map data snapshot date and source-family disclosure

The public app remains static. The `/research` page fetches the committed public summary and county JSON shards client-side so the full queue is not embedded in initial HTML. No production route calls source APIs or opens SQLite.

### Implemented Commands

```bash
npm run research:migrate
npm run research:compile
npm run research:index
npm run research:refresh
npm run check:research-integrity
npm run validate:data
```

`research:migrate` and `research:compile` write tracked artifacts. `research:index` writes only the ignored local SQLite file. Inspect the worktree before running generation commands.

The current compiler does not yet accept an explicit `--as-of` parameter. The combined `research-runs.json` is a bootstrap receipt index, not the final immutable per-run receipt layout.

### Locked Data Semantics

1. A missing row is unknown and not researched unless a run receipt proves a source-family screen.
2. Verified presence requires reputable county-level evidence with exact taxon and geography mapping.
3. Verified absence requires an explicit authoritative absence statement for the exact species, county, time, and scope.
4. Not detected requires explicit target, location, time, method or program, effort context, and negative result semantics.
5. A point, plot, route, trap, sample, apiary, or survey-area non-detection is not countywide absence.
6. Positive evidence controls the compatibility display when positive and survey non-detection coexist. Preserve both evidence records.
7. Agents and source adapters emit evidence, rejections, outcomes, and receipts. They do not hand-edit compiled status files.
8. Source silence, empty results, request failure, skipped records, and missing list entries never create negative evidence.
9. Every source must be registered and every accepted assertion must retain a direct URL, source identity, scope, date when available, lineage, and caveat.
10. Compilation is offline and deterministic from versioned inputs. Network access belongs only in source acquisition runs.
11. SQLite is disposable and local. Never commit it, deploy it, or treat it as authority.
12. Report determination coverage, source-screen research coverage, and protocol completion separately.

### EDDMapS Bounded Merge Caveat

`npm run merge:eddmaps-county-data` is an additive compatibility operation. The merged legacy snapshot stores species-level county lists and species-level source references but cannot reconstruct every source-to-county edge. It cannot safely subtract older EDDMapS-only pairs without a full source-family rebuild.

Never use the bounded merge to claim absence, non-detection, complete synchronization, or refresh of unrelated source families. Preserve `bounded_additive_merge: true` and this caveat in any run record that uses it.

### Known Contradiction And Review Queue

The migration found `312` source assertions representing `176` distinct Alabama positive pairs in the April 2026 GBIF and iDigBio preserved-specimen snapshots that are not in the current authoritative matrix. The migration did not silently promote them. They are recorded in `src/data/research/migration-candidates.json`.

Treat those pairs as candidates, not determinations. The older snapshots preserve species, county, source family, and query URL but often lack one retained source record per pair. Requery and verify the underlying specimen evidence through registered source-family adapters before accepting any pair.

### Current Architecture Gaps

Do not claim these are complete yet:

- JSON schemas for registry, evidence, review, receipt, outcome, and projection records
- append-only review, retraction, and superseding event files
- explicit rejection ledger
- immutable detailed per-run receipt and outcome directories
- registered parameterized adapter runner
- adapter version, parameter hash, artifact hash, error, and secret-free rerun fields
- explicit compiler `--as-of`
- source-specific freshness and review policy
- protocol-complete pair outcomes and metric
- byte-stability verification across two clean compiler runs

The current migration script reconstructs the bootstrap assertion ledger from compatibility inputs. Before routine source acquisition begins, extend the compiler to consume immutable run evidence in addition to the migration ledger so new accepted evidence is not overwritten by a future migration refresh.

### Recommended Next Work

Use sub-agents for bounded, disjoint source-family work when available. Keep the critical compiler and review integration local.

1. Reverify git, generated counts, integrity, and live `/research` behavior.
2. Implement the next event-model slice: schemas, immutable per-run receipts, rejection records, explicit pair outcomes, and compiler ingestion of run evidence.
3. Implement one registered parameterized adapter for GBIF preserved specimens or iDigBio preserved specimens.
4. Requery a reviewable tranche of the 176 deferred pairs and preserve record IDs, exact taxon match, county evidence, dates, query parameters, and rejection reasons.
5. Accept only pairs that pass the source-family publication gate. Leave ambiguous pairs unresolved or rejected.
6. Compile and report exact baseline, post-change, and net counts for present, absent, not detected, researched unresolved, not researched, evidence records, and candidates remaining.
7. Run all quality gates, commit the scoped changes, push `main`, and verify Vercel READY plus the live route.

Do not spend the next pass on county-card polish unless live verification reveals a concrete usability defect. The priority is trustworthy source-family throughput and auditability.

### Required Quality Gates

Run the relevant generators only when their inputs changed, then run:

```bash
npm run check:data-integrity
npm run check:research-integrity
npm run typecheck
npm run lint
npm run build
git diff --check
```

For UI changes, verify `/research` and `/` in a real browser on desktop and mobile. Exercise county selection, status filtering, source operations, queue search, evidence expansion, and direct source links. Confirm no horizontal overflow or overlapping text.

Before final response, scan authored files for em dash and en dash characters. Project guidance forbids both.

### Final Response Contract

Stay through implementation, evaluation, commit, push, and deployment verification. Report:

- what was implemented
- every relevant file changed
- exact commands run and pass or fail state
- exact baseline, post-change, and net data counts
- evidence records added, rejected, deferred, and still needing research
- verified present, verified absent, not detected, researched unresolved, and not researched counts
- determination coverage and source-screen research coverage separately
- remaining architecture gaps or source caveats
- commit hash and successful push to `main`
- Vercel deployment state and live route verification

Use `CONFIRMED`, `INFERRED`, and `UNKNOWN / NOT CONFIRMED` when uncertainty matters. Never present stale memory as current verification.
