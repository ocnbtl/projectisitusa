# Project Isitusa Repository Instructions

## Canonical Checkout

- Work in `/Users/ocean/Code/Project Isitusa`.
- Treat `/Users/ocean/Documents/Project Isitusa` as a legacy checkout.
- Work directly on `main` unless the user explicitly requests a branch.
- Begin every task with `git status --short --branch` and `git log -1 --oneline`.
- The repository may contain concurrent work. Do not revert, overwrite, stage, or reformat edits you did not make.
- Keep commits scoped. Never include unrelated dirty files.

## Canonical Documentation

Read these files before changing county-species data or research tooling:

1. `docs/architecture/evidence-research-system.md`: target architecture and invariants.
2. `docs/research/README.md`: evidence research workflow and acceptance rules.
3. `docs/handoffs/NEXT-CHAT-PROMPT.md`: current continuation prompt and verification checklist.
4. `docs/source-inventory.md`: historical source inventory and source-specific caveats.
5. `docs/county-audit/README.md`: historical county research framework.
6. `docs/county-coverage/README.md`: legacy matrix behavior during migration.

When guidance conflicts, current code and freshly generated outputs come first, followed by the architecture document, this file, the research workflow, and historical audit reports. Surface contradictions explicitly. Do not rewrite historical reports to make them look current.

The current research foundation starts in `src/data/research/source-registry.json`, `src/data/research/research-protocols.json`, `src/lib/research/types.ts`, and `src/lib/research/source-adapter.ts`. Inspect and extend those files instead of creating a parallel model. Early implementation remains subject to the architecture acceptance gates.

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

The Alabama compatibility baseline verified on 2026-07-14 was:

- `2504` species x `67` counties = `167768` county-species pairs
- `15133` verified present
- `0` verified absent
- `8` not detected
- `152627` legacy unknown
- `15141` known, or `9.02%`

The completed research compiler checkpoint verified on 2026-07-14 was:

- `30130` evidence records
- `15` research runs
- `29` registered sources
- `15133` verified present and `0` verified absent
- `8` survey non-detections
- `95580` researched unresolved
- `57047` not researched
- `9.02%` determination coverage, counting present and explicitly absent only
- `66.00%` research coverage, counting source-family screens and not-detected
- `1558` legacy fallback pairs preserved
- `176` distinct GBIF or iDigBio snapshot positives deferred as explicit migration candidates

The legacy compatibility known count remains `15141` and `9.02%`. Do not label the `8` not-detected pairs as determinations.

These values are a dated migration and compiler baseline, not permanent constants. Reverify generated counts before every implementation, handoff, or count claim.

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
npm run typecheck
npm run build
```

Do not run generation commands casually in a dirty worktree. They write tracked artifacts. Inspect the diff and report exact baseline, post-change, and net counts.

The current compatibility foundation exposes `npm run research:migrate`, `npm run research:compile`, `npm run research:index`, and `npm run research:refresh`. Read `package.json` and the underlying scripts before use. Migration and compilation write tracked artifacts. Do not confuse these compatibility commands with the unfinished final adapter, receipt, review-event, and explicit `as_of` interfaces in the architecture document.

## Writing Rules

- Use ASCII in authored repository guidance unless an existing file requires otherwise.
- Do not use em dash or en dash characters.
- Prefer exact dates, paths, source IDs, commands, and counts over relative descriptions.
- Label proposed paths and commands as proposed until code and package scripts implement them.
- Do not hand-edit generated files or historical audit reports.
