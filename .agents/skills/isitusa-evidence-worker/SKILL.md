---
name: isitusa-evidence-worker
description: Execute one lease-bound Project Isitusa evidence job in an isolated codex worktree. Use for bounded national-source acquisition, state or local source screening, evidence review, immutable run creation, deterministic partitioning, deferred-pair research, protocol-cell evaluation, or other worker tasks that must return auditable artifacts and a validated completion manifest without touching main or shared projections.
---

# Isitusa Evidence Worker

## Authority boundary

Work only inside the active lease. The lease is more restrictive than a task prompt. Stop and record a blocker when instructions require a path, scope, source, schema, or command the lease does not permit.

Never:

- work in the canonical MAIN checkout
- use or write `main`
- merge, rebase onto moving `main`, push `main`, deploy, or publish
- edit project-local skills, shared schemas, registries, compilers, application code, or shared projections
- run shared generators, full builds, or production browser suites
- infer a county from coordinates unless the lease points to an approved versioned geography policy
- turn silence, empty results, failed requests, rejected records, missing geography, partial pagination, or incomplete coverage into absence or non-detection

Read [references/evidence-contract.md](references/evidence-contract.md) and [references/event-examples.md](references/event-examples.md) before preflight or evidence work.

The frozen evidence-run completion profile covers exactly one registered source, one state, and one or more exact county-species pairs. It is suitable for bounded state-source, evidence-review, and state-partition jobs that emit a complete immutable run. National acquisition, protocol-only, and bounded-infrastructure output shapes require a separately evaluated completion profile and must remain MAIN-only or blocked until one exists.

## 1. Preflight the lease

Run the validator before editing:

```bash
node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease <lease-json> --repo <worktree>
```

Verify:

- active unexpired lease and exact job ID
- isolated worktree and exact `codex/*` branch
- HEAD equals the lease base SHA before worker changes
- orchestrator and worker skill content hashes match the lease pins
- permitted and prohibited paths are explicit
- state, source, taxa, pair, artifact, retry, memory, and completion scope is bounded

Do not edit when preflight fails. Return the JSON failure and a blocker.

## 2. Verify the source and scope

Confirm publisher identity, source URL, current availability, terms, freshness, stable record identity, supported evidence types, geographic fields, taxon fields, retention rules, rate limits, and known caveats.

Use the source registry when it is already registered. If a shared registry or schema change is needed, write a proposal or blocker only. Do not make the change.

Record normalized source parameters before acquisition. Prefer one national acquisition that can be partitioned across states over repeated identical state requests when the lease permits it.

## 3. Acquire immutably and resumably

Write only permitted worker artifacts. Use bounded pagination, request intervals, timeouts, retries, artifact byte limits, and stable checkpoints. Preserve:

- requested URLs and normalized parameters
- retrieval timestamps, response status, declared totals, page identity, and resume token
- raw or normalized artifacts as allowed by terms
- bytes and SHA-256 for every retained artifact
- errors, retryability, warnings, and partial scope

Preserve provider bytes exactly. When a retained response can contain provider-controlled line endings or trailing whitespace, use a repository-declared binary artifact pattern such as `*.headers.txt`, `*.raw`, or `*.bin`. Never normalize or rewrite source bytes merely to satisfy a Git whitespace check.

For every request, record one request-group ID, response status, retrieval time, declared and received counts, and explicit pagination mode, page index, offset or cursor lineage, and terminal-page state. Complete pagination requires contiguous pages, reconciled totals when the provider declares one, one terminal final page, and only successful upstream statuses.

Never overwrite a completed immutable run. Never replace a known-good artifact with a failed or malformed response. On interruption, leave a resumable checkpoint and mark unfinished scope incomplete.

## 4. Emit honest evidence events

For every materially considered record, emit an accepted assertion or explicit rejection. Deduplicate source records deterministically while retaining repeat-run lineage.

Positive presence requires exact taxon and exact approved county mapping from a reputable record. Preserve source ID, stable record locator, direct URL, dates when available, publisher or dataset identity, parameters, geography, review, caveats, hashes, and run ID.

Verified absence requires explicit authoritative exact-species, exact-county, time, and scope evidence. Not detected requires explicit target, geography, time, method or program, effort, and negative result. Keep point, plot, route, trap, sample, apiary, and survey-area results at their true scale.

When qualifying evidence is absent after a completed applicable screen, emit `no-qualifying-evidence` with `scope_complete: true`. This is researched unresolved, not absence or non-detection.

Use `needs-followup` or `blocked` with `scope_complete: false` for failed, partial, ambiguous, stale, unavailable, unsupported, or out-of-scope work.

Preserve positive and non-detection evidence together when both exist. Positive evidence controls compatibility display, but neither record is removed.

## 5. Review and count

Apply the registered publication gate. Emit review events; never mutate an assertion into a reviewed state. Keep assertions, reviews, rejections, outcomes, receipts, and artifacts internally consistent.

Keep the immutable run receipt on the stable closed `run-receipt.schema.json` contract. Put lease identity, retry history, request purpose, attempt telemetry, and performance data in the worker manifest or `source-verification.json`. Never add worker-only fields to the receipt.

Bind agent actor IDs to the lease worker task ID and adapter actor IDs to `<adapter-id>@<adapter-version>`. Workers cannot claim human actors or `human-approved` review level. An `evidence-found` outcome must report exactly the final publication-eligible assertions for its pair. A `no-qualifying-evidence` outcome must have none.

Report exact baseline, final, and net counts for every metric touched. Net must equal final minus baseline. Distinguish provider candidates, assertion events, projected evidence, distinct outcome pairs, final determinations, research statuses, and protocol cells.

Do not call source-screen coverage or not-detected records determination coverage.

## 6. Validate, commit, and return

Create the completion manifest at the exact lease path. It must include source parameters, artifacts, assertions, reviews, rejections, outcomes, receipt and source-verification descriptors, blocked items, exact counts, verification commands and results, retry and resume state, content commit SHA, remaining work, performance measures, and pinned skill values.

The receipt must declare every event file and `source-verification.json` as outputs. The manifest must report every changed worker file exactly once. Descriptor paths, bytes, and hashes must match the retained files and the content commit.

Run before committing:

```bash
node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs manifest --lease <lease-json> --manifest <manifest-json> --repo <worktree>
git diff --check
```

Use the two-commit manifest sequence so the manifest does not claim its own impossible self-referential commit hash:

1. Create the artifacts, events, outcomes, source verification, canonical receipt, and a local draft manifest.
2. Commit the evidence outputs without the manifest.
3. Set `manifest.commitSha` to that non-base content commit SHA and record the passing commands.
4. Run manifest validation against the dirty final manifest. The validator invokes the project's canonical immutable-run validator and verifies every reported file at the content commit.
5. Commit the final manifest as a second permitted commit.
6. Run `git diff --check <lease-base-sha>...HEAD` and record that exact base-to-head command in `verificationCommands`.
7. Rerun manifest validation. The validator independently runs the worktree and base-to-head whitespace checks. The reported content commit must be an ancestor of branch HEAD.

MAIN completion additionally requires the worktree to be clean, the final manifest bytes to exist exactly at branch HEAD, and the executed validator tree to match the lease pin. MAIN archives those exact manifest bytes under durable orchestration state. A partial or failed manifest may be archived for recovery but is never queued for integration.

Commit only permitted files to the assigned branch. Do not push unless the lease explicitly permits pushing that worker branch.

Return to MAIN:

- job ID, lease ID, branch, worktree, base SHA, content commit SHA, and branch HEAD SHA
- manifest path and SHA-256
- exact counts and verification evidence
- caveats, blocked scope, resume state, and remaining work
- shared-change proposals, if any

MAIN decides whether to reject, request correction, or integrate. Worker completion never authorizes generation, release, or deployment.
