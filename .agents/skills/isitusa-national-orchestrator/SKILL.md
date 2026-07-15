---
name: isitusa-national-orchestrator
description: Coordinate Project Isitusa national evidence research as the exclusive main integration owner. Use when planning, leasing, dispatching, recovering, reviewing, integrating, generating, releasing, or reporting multi-worker national, state, source-family, protocol, or evidence jobs in the canonical Project Isitusa repository.
---

# Isitusa National Orchestrator

## Operating authority

Act as the only writer, merger, committer, pusher, and deployer for `main`. Keep MAIN in the canonical checkout. Put every worker on a lease-bound `codex/*` branch in an isolated worktree. Workers may commit only to their branches.

Never let a worker:

- write, merge, push, or deploy `main`
- edit either project-local skill
- edit shared schemas, registries, compilers, application code, or shared projections unless its lease explicitly classifies that job as MAIN-only
- run public projection generation, production builds, or deployment commands
- broaden its state, source, taxon, pair, or path scope

Read [references/contracts.md](references/contracts.md) before creating or changing jobs, leases, manifests, receipts, or integration state.

## 1. Establish MAIN ownership

Before editing or dispatching:

1. Verify the canonical path, current branch, HEAD, `origin/main`, worktrees, and clean or explained status.
2. Inspect Codex tasks and local processes. Stop if another Project Isitusa task is actively writing `main`, merging, pushing, compiling shared outputs, building, or deploying.
3. Record a machine-readable MAIN ownership receipt under `ops/national-research/` with task identity, base SHA, start time, and evidence checked.
4. Reverify current generated counts, GitHub, Vercel, live routes, source availability, and dated contradictions.
5. Preserve unrelated user changes and historical evidence.

## 2. Plan bounded jobs

Create jobs in the repository registry. Prefer acquisition once at national scope followed by deterministic state partitioning. Use state jobs for official state, university, museum, nonprofit, local survey, applicability, and exception work.

Every job must define:

- stable job ID and worker type
- state or source-family scope
- taxon or exact pair scope
- hierarchical `scopeClaims`
- base SHA, branch, worktree, permitted paths, and prohibited paths
- expected outputs and completion criteria
- retry, artifact, pagination, time, and memory limits
- pinned orchestrator and evidence-worker versions and content hashes
- dependencies, priority, state, and recovery policy

Use `scopeClaims` as slash-delimited paths with `*` only as a whole segment. Two active claims overlap when each segment is equal or one segment is `*`. Reject overlapping active leases before creating a worktree.

Keep full compilers, public generation, builds, browser suites, and large transforms centralized and sequential. Use only bounded low-memory workers.

The evaluated evidence-run worker profile accepts one source, one state, and exact county-species pairs. Dispatch only state-source, evidence-review, or state-partition jobs that fit that profile. Keep national acquisition, protocol-only, and bounded-infrastructure execution centralized until their distinct output contracts pass their own evaluation.

## 3. Freeze and pin skills

Treat changed skill contents as candidates until static validation, every bundled script, the complete adversarial suite, blind forward tests, and a bounded real pilot pass.

Permit at most three refinement cycles per version. Require zero critical safety violations and at least one measured improvement over the comparable unskilled workflow without evidence-quality regression.

When passing:

1. Stop skill edits.
2. Commit the skill version from MAIN.
3. Hash the complete sorted skill contents.
4. Record the commit and hash in the evaluation and freeze receipt.
5. Pin both values in every later lease, worker manifest, and receipt.

Do not edit a pinned skill while any active lease references it. Later changes create a new candidate version and repeat the gate.

## 4. Claim and dispatch

Use `scripts/orchestrate.mjs` for registry and lease operations. Run its `validate` command before and after every mutation.

For each worker:

1. Create or verify the isolated worktree from the lease base SHA.
2. Create the exact lease branch named `codex/<job-id>` unless the job records another approved `codex/*` name.
3. Verify the worktree is not the canonical checkout and the branch is not `main`.
4. Write the active lease atomically.
5. Give the worker only the skill paths, lease path, raw inputs, bounded scope, and output contract.
6. Require the worker to run `$isitusa-evidence-worker` preflight before editing.

Do not leak expected answers into blind forward tests. National acquisition jobs that acquire one reusable source snapshot may start before state pilots when their scopes are bounded and nonoverlapping. Do not broadly dispatch state certification or state-partition jobs until two pilot state integrations complete without shared-schema changes, lease collisions, generated-output conflicts, or evidence-semantic regressions.

## 5. Review and integrate

Never trust a worker completion claim without independent checks.

For each returned commit:

1. Validate the lease and worker manifest. A completed transition invokes the same canonical worker validator before any job, lease, or queue mutation.
2. Verify branch, base SHA, pinned hashes, content commit, branch-head commit, exact changed paths, and no prohibited path. Execute the validator only from the independently hash-checked worker skill tree.
3. Inspect assertions, reviews, rejections, outcomes, receipts, raw artifacts, source parameters, hashes, retries, and resume state.
4. Recheck evidence semantics. Source silence, an empty result, failure, rejection, missing geography, or incomplete coverage cannot create absence or non-detection.
5. Run worker verification commands and the relevant MAIN integration checks.
6. Reject, request correction, or integrate the commit centrally.
7. Record queue decision, merge conflicts, manual interventions, wall time, memory pressure, and valid throughput.

MAIN alone regenerates shared research, compatibility, presence, explorer, county, dashboard, and public artifacts after validated integration. MAIN alone runs release gates, commits, pushes, and verifies production.

Treat a pending integration-queue item as a validated submission, not as acceptance. MAIN still performs an independent diff, evidence, integrity, and merge review.

The transition gate requires a clean worker worktree and exact committed manifest bytes at worker HEAD. It copies those exact bytes to `ops/national-research/manifests/`, records their hash, byte count, content commit, and branch head on the lease and queue item, and rejects later tampering. Valid partial results can be archived durably for retry but are not queued.

## 6. Recover safely

Expire or recover a lease only through MAIN. Preserve partial artifacts and resume tokens. Never overwrite a completed immutable run. A retry uses the same job ID with an incremented attempt and a new lease ID, branch or clean worktree state as recorded by policy.

If a worker discovers a needed shared-schema or architecture change, require a proposal or blocker in its manifest. End that worker scope without making the shared change.

Stop new dispatch when repeated interruption, worker lifetime, MAIN context pressure, merge conflict, memory pressure, or source limits make the topology unreliable. Quantify the failure before proposing persistent state tasks.

## 7. Report national progress

Maintain the repository dashboard from durable state, not chat memory. Report separately:

- determination, survey, research, freshness, review, and conflict axes
- baseline research coverage, applicable protocol completion, category completion, pair outcome coverage, and determination coverage
- exact state, county-equivalent, species, pair, evidence, review, rejection, outcome, deferred, protocol-cell, job, failure, and conflict counts
- baseline, final, and net values
- throughput, worker completion rate, wall time, manual interventions, merge conflicts, and memory pressure
- forecast assumptions, measured rate, target gap, and topology improvements

Do not call a state ready until public and research projections agree, deferred work is resolved or blocked, baseline screening and readiness thresholds pass, conflicts are adjudicated, outputs are deterministic, and normal county plus research routes pass production QA.

## Commands

Run from the canonical repository:

```bash
node .agents/skills/isitusa-national-orchestrator/scripts/orchestrate.mjs validate --root ops/national-research
node .agents/skills/isitusa-national-orchestrator/scripts/orchestrate.mjs claim --root ops/national-research --job <job-id> --lease <lease-json>
node .agents/skills/isitusa-national-orchestrator/scripts/orchestrate.mjs transition --root ops/national-research --lease <lease-id> --state completed --manifest <manifest-json>
node .agents/skills/isitusa-national-orchestrator/scripts/orchestrate.mjs dashboard --root ops/national-research --as-of <ISO-time>
```

Treat script failure as a safety stop. Preserve its JSON error output in evaluation evidence.
