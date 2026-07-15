# Project Isitusa Repository Instructions

## Canonical Checkout

- Work in `/Users/ocean/Code/Project Isitusa`.
- Treat `/Users/ocean/Documents/Project Isitusa` as a legacy checkout.
- The long-lived MAIN integration task is the only owner of `main`. MAIN alone may edit, merge, commit, push, regenerate shared public projections, or deploy from `main`.
- Every bounded source, state, evidence-review, or infrastructure worker uses an isolated `codex/*` branch and worktree plus a machine-readable lease under `ops/national-research/`. Workers never merge, push `main`, deploy, edit shared schemas or skills, or generate shared projections.
- Begin every task with `git status --short --branch` and `git log -1 --oneline`.
- The repository may contain concurrent work. Do not revert, overwrite, stage, or reformat edits you did not make.
- Keep commits scoped. Never include unrelated dirty files.

## Canonical Documentation

Read these files before changing county-species data or research tooling:

1. `docs/architecture/evidence-research-system.md`: target architecture and invariants.
2. `docs/research/README.md`: evidence research workflow and acceptance rules.
3. `ops/national-research/jobs.json`, `leases.json`, `integration-queue.json`, and `readiness-dashboard.json`: durable current orchestration state.
4. `src/data/research/state-registry.json`, `county-equivalent-registry.json`, and `state-research-config.json`: current national scope and projection configuration.
5. `docs/handoffs/NEXT-CHAT-PROMPT.md`: historical continuation material that is superseded unless MAIN ownership is explicitly transferred.
6. `docs/source-inventory.md`: historical source inventory and source-specific caveats.
7. `docs/county-audit/README.md`: historical county research framework.
8. `docs/county-coverage/README.md`: legacy matrix behavior during migration.

When guidance conflicts, current code and freshly generated outputs come first, followed by the architecture document, this file, the research workflow, and historical audit reports. Surface contradictions explicitly. Do not rewrite historical reports to make them look current.

The current research foundation starts in `src/data/research/source-registry.json`, `src/data/research/research-protocols.json`, `src/data/research/state-registry.json`, `src/data/research/county-equivalent-registry.json`, `src/data/research/state-research-config.json`, `src/lib/research/types.ts`, and `src/lib/research/source-adapter.ts`. Inspect and extend those files instead of creating a parallel model.

## National Orchestration Policy

- MAIN plans work in the job registry, rejects overlapping active leases, reviews every worker manifest and diff, integrates validated commits, and runs all shared generation and release gates centrally.
- Every lease pins a base SHA, branch, worktree, path allowlist, path denylist, skill versions and hashes, expected outputs, retry policy, expiration state, and completion criteria.
- Every completion manifest reports source parameters, artifacts, assertions, reviews, rejections, outcomes, blocked items, exact baseline/final/net counts, verification commands, commit SHA, and remaining work.
- A worker that discovers a shared-schema or shared-skill requirement records a blocker or proposal. It does not implement the shared change.
- Durable job state belongs in repository artifacts, not chat history.
- The 2026-07-15 candidate orchestrator and evidence-worker skills did not pass their third and final bounded refinement cycle because a blind real pilot produced a receipt rejected by the existing receipt schema. They are not frozen. Broad worker dispatch remains prohibited until a later candidate passes the full evaluation gate.

## Nonnegotiable Data Rules

- Keep the public Next.js application static. Research, source access, SQLite, and compilation run before build or locally, never as production request-time dependencies.
- The county-species evidence ledger is append-only. Correct mistakes with review, retraction, or superseding events. Never rewrite history in place.
- Keep determination, survey, research, freshness, and review as separate axes.
- A missing row is unknown. It is never evidence of absence or non-detection.
- Accept negative evidence only when the source explicitly supports the exact county, species, survey scope, time scope, and negative claim.
- Agents may produce evidence assertions, rejection records, research outcomes, and source-run receipts. Agents never edit the compiled truth matrix or public projections by hand.
- Every source must be registered. Every acquisition must use a registered, parameterized adapter and produce an immutable run receipt.
- Compilation is deterministic and offline from versioned inputs. Network access belongs only in source runs.
- The local SQLite database at `.cache/research/isitusa.sqlite` is a disposable generated query index, not a source of truth and not a public runtime dependency.
- Public data is emitted as static per-state and per-county projections under `public/generated/research/<STATE>/`.

## Coverage Semantics

Report research coverage separately from determination coverage.

- Determination coverage counts pairs with `verified-present` or `verified-absent` determination status.
- Survey non-detection is reported on the survey axis. Legacy known compatibility coverage may also count `not-detected`, but it must not be mislabeled as determination coverage.
- Bootstrap source-screen research coverage counts pairs with a resolved status or at least one completed source-family screen. It does not mean the category protocol is complete.
- Protocol-complete research coverage requires explicit current pair outcomes under the target event model and must be reported separately once implemented.
- Research completion does not create a determination.
- Survey non-detection does not erase verified presence. The separate survey axis preserves both facts.

The Alabama compiler and public parity checkpoint verified on 2026-07-15 is:

- `2504` species x `67` counties = `167768` county-species pairs
- `15222` verified present
- `0` verified absent
- `8` not detected
- `95491` researched unresolved
- `57047` not researched
- `30291` evidence records
- `329` rejections
- `113` raw pair outcomes across `110` distinct pairs
- `26` research runs
- research, compatibility, `presence.json`, `explorer-presence.json`, and the normal county experience agree on reviewed presence

The national geography and bounded pilot projection checkpoint verified on 2026-07-15 is:

- `51` configured v1 state or district jurisdictions with `3144` current county equivalents
- Alaska has `30` current county equivalents, including `02063` and `02066`; retired `02261` is not accepted as current scope
- Connecticut uses `9` current planning regions; its `8` former counties are retained only as retired geography lineage
- bounded research projections exist for Alabama, Alaska, Arizona, and Arkansas
- Alaska, Arizona, and Arkansas pilot projections remain research-only and contain no published determinations before real pilot evidence is integrated
- explicit protocol cells remain separate from determination and source-screen coverage

These are dated compiler checkpoints, not permanent constants. Reverify generated counts before every implementation, handoff, or count claim. Do not label the `8` not-detected pairs as determinations.

## EDDMapS Bounded Merge

`npm run merge:eddmaps-county-data` is a bounded compatibility operation. It preserves existing non-EDDMapS coverage and unions the current EDDMapS snapshot into the combined county snapshot. The legacy combined snapshot does not attribute each county row to one source, so the bounded merge cannot reliably remove a county row that may previously have come only from EDDMapS. Treat it as additive, partial, and unsuitable for absence claims or full-refresh claims. Record this limitation in the source-run receipt whenever the compatibility path is used.

## Verification

Use the narrowest relevant checks, then broaden when generated behavior or public routes are affected:

```bash
cd "/Users/ocean/Code/Project Isitusa"
git status --short --branch
git log -1 --oneline
npm run build:county-matrix -- AL
npm run check:data-integrity
npm run check:research-integrity
npm run check:state-research-projections
npm run check:national-research-config
npm run build:national-readiness -- --as-of 2026-07-15
npm run typecheck
npm run build
```

Do not run generation commands casually in a dirty worktree. They write tracked artifacts. Inspect the diff and report exact baseline, post-change, and net counts.

The implemented compiler interface requires an explicit state and as-of date, for example `npm run research:compile -- --state AL --as-of 2026-07-15`. `research:verify` accepts the same scope and proves byte stability. `research:index` builds the ignored local index. Read `package.json` and the scripts before use because compilation and refresh commands write tracked artifacts.

## Writing Rules

- Use ASCII in authored repository guidance unless an existing file requires otherwise.
- Do not use em dash or en dash characters.
- Prefer exact dates, paths, source IDs, commands, and counts over relative descriptions.
- Label proposed paths and commands as proposed until code and package scripts implement them.
- Do not hand-edit generated files or historical audit reports.
