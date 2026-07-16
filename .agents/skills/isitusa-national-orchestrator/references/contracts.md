# Orchestration Contracts

Read this file before creating or modifying durable orchestration state.

## Repository state

Store durable state under `ops/national-research/`:

- `owner.json`: exclusive MAIN ownership receipt
- `jobs.json`: planned jobs and their lifecycle state
- `leases.json`: immutable lease attempts with explicit recovery state
- `integration-queue.json`: worker results awaiting MAIN decisions
- `dashboard.json`: generated national progress and throughput snapshot
- `manifests/<job-id>__<lease-id>.json`: exact worker completion manifests
- `evaluations/<evaluation-id>.json`: skill and pilot evidence
- `receipts/`: freeze, integration, generation, release, and recovery receipts
- `fixtures/`: synthetic adversarial inputs only

Do not use chat history as the only copy of active state.

## Job shape

Each job object requires:

```json
{
  "jobId": "source-gbif-national-001",
  "workerType": "national-source",
  "stateOrSourceScope": {"states": ["AK", "AZ"], "sourceFamilies": ["gbif"]},
  "taxaOrPairScope": {"taxa": ["*"], "pairs": []},
  "scopeClaims": ["source/gbif/state/AK/taxon/*", "source/gbif/state/AZ/taxon/*"],
  "baseSha": "40 lowercase hex characters",
  "branch": "codex/source-gbif-national-001",
  "worktree": "/absolute/noncanonical/path",
  "permittedPaths": ["src/data/research/worker-results/source-gbif-national-001/**"],
  "prohibitedPaths": [".agents/skills/**", "public/generated/**", "src/data/generated/**"],
  "skillPins": [{"name": "isitusa-evidence-worker", "gitCommit": "40 lowercase hex characters", "contentHash": "64 lowercase hex characters"}],
  "expectedOutputs": ["manifest", "artifacts", "assertions", "reviews", "rejections", "outcomes", "receipt", "source-verification"],
  "retryPolicy": {"maxAttempts": 3, "backoffSeconds": [5, 30, 120], "resumeRequired": true},
  "resourcePolicy": {"maxArtifactBytes": 50000000, "maxWallMinutes": 45, "maxMemoryMb": 1536},
  "expiresAt": "ISO date-time",
  "recoveryState": "none",
  "completionCriteria": ["one manifest", "all requested pairs have outcomes"],
  "dependencies": [],
  "priority": 100,
  "state": "planned"
}
```

Allowed worker types are `national-source`, `state-source`, `evidence-review`, `partition`, `protocol`, and `bounded-infrastructure`. Allowed job states are `planned`, `leased`, `submitted`, `integrating`, `completed`, `blocked`, `failed`, and `cancelled`.

## Lease shape

A lease copies every safety-critical job field and adds:

- unique lease ID and positive attempt number
- `active`, `completed`, `expired`, `recovered`, `failed`, or `cancelled` state
- claimed and expiration timestamps
- worker task identity
- expected manifest path
- previous lease ID on retry
- recovery reason and recovery timestamp when applicable

Do not mutate a completed attempt into a retry. Append a new attempt.

The job registry describes the currently schedulable attempt and may advance to a new base, branch, worktree, or pinned skill after an earlier lease closes. Every historical lease retains its own complete immutable snapshot. Only an active lease must equal the job's current execution fields.

Claim and transition commands are transactional across their repository state files. If the proposed state fails post-write validation, restore the exact pre-command documents before returning failure.

Every new job and active lease uses the complete fixed output vocabulary shown above. Historical terminal leases retain their original snapshots and may produce validation warnings when they predate `source-verification`, but they cannot be reactivated under the weaker contract.

Compute every skill `contentHash` from repository-relative file paths ordered by Unicode code point, with each path and file byte sequence separated by a null byte. The filesystem-tree and pinned Git-tree procedures must use the identical ordering. Locale-sensitive ordering is forbidden because it can make a valid pinned commit fail in another worktree or host locale.

`expectedManifestPath` is a normalized worktree-relative path. A completed transition derives the worktree from the lease, requires the supplied manifest to equal that path, independently verifies the pinned skill trees, and executes the worktree-pinned evidence-worker validator while the lease is still active. It requires a clean worktree, a complete manifest committed exactly at worker HEAD, and unchanged manifest bytes and HEAD. Only then may it archive the exact bytes, close the lease, submit the job, and append a pending queue item.

The durable result descriptor records manifest path, SHA-256, byte count, manifest status, content commit, and worker branch HEAD. The queue path stays under `manifests/`. Pending queue validation rechecks the durable bytes, lifecycle identities, clean worker worktree, branch HEAD, commit ancestry, and committed manifest bytes. Historical nonpending queue items can retain older external paths only as warnings and can never become pending again.

A noncompleted transition may include a canonically valid partial, blocked, or failed manifest. Archive it with the same durable descriptor on the terminal lease, but do not append it to the integration queue.

## Scope collision rules

Normalize a claim by splitting on `/`. Reject empty segments, `..`, and embedded wildcards. Two claims overlap when they contain the same number of segments and each position is equal or at least one side is `*`.

Examples:

- `state/AK/source/*/taxon/*` overlaps `state/AK/source/gbif/taxon/slug`
- `state/AK/source/gbif/taxon/a` does not overlap `state/AZ/source/gbif/taxon/a`
- broad national acquisition and state partition jobs need distinct claims such as `acquire/source/gbif/snapshot/2026-07-15` and `partition/source/gbif/state/AK`

When path ownership could still collide, split permitted output roots by job ID.

## MAIN-only paths

Workers must treat these as prohibited unless MAIN itself executes the job without delegation:

- `main` and the canonical checkout
- `.agents/skills/**`
- `AGENTS.md`
- `package.json` and lockfiles
- shared schemas, source registry, state registry, protocol registry, compilers, and orchestration scripts
- `src/data/generated/**`
- `public/generated/**`
- compatibility matrices and public route code
- Vercel and deployment configuration

Worker run directories may be permitted only when the lease assigns a unique, non-overlapping run or staging root.

## Integration decisions

Queue decisions are `pending`, `accepted`, `changes-requested`, `rejected`, `integrated`, and `superseded`. Record reviewer, timestamp, worker commit, manifest hash, changed paths, checks, conflicts, manual interventions, and reason.

Integration requires zero prohibited writes, exact skill pins, complete manifest fields, valid count arithmetic, valid evidence semantics, and fresh relevant checks. Central generation follows integration and never runs in a worker worktree.

Use only the transactional `review` and `integrate` commands for modern durable queue items. Do not edit a queue decision or job lifecycle field by hand.

The closed review receipt requires:

- queue, job, and lease identity
- `accepted`, `changes-requested`, `rejected`, or `superseded` decision
- reviewer and review timestamp
- worker content commit, worker branch head, and manifest hash
- the exact code-point-ordered base-to-head changed-path set
- nonempty command checks with exit codes and results
- conflict, manual-intervention, critical-safety, evidence-semantic, and forbidden-write counts
- a nonempty reason

Acceptance requires all checks to pass and all safety, semantic, forbidden-write, and conflict counts to be zero. The review gate also requires exactly two worker commits after the lease base: content first and finalized manifest second. It archives the exact review receipt under `receipts/reviews/`, updates the queue, and moves the job from `submitted` to `integrating` in one rollback-safe transaction.

The closed integration receipt repeats the immutable worker and manifest identities and adds the integrator, integration timestamp, and clean canonical integration commit. Before marking the result integrated, compare every reviewed changed path by Git tree entry between the worker branch head and canonical `main`. Archive the exact receipt under `receipts/integrations/`, move `accepted` to `integrated`, and move the job from `integrating` to `completed` in one rollback-safe transaction. The receipt commit itself is later than the integration commit it records, so it does not self-attest its own Git future.

## Readiness and throughput

The dashboard must keep these separate:

- determination coverage
- survey results
- baseline source-screen coverage
- applicable protocol completion
- category completion
- pair outcome coverage
- review and freshness
- conflicts and blocked work

Forecast with measured valid screened-pair or applicable-cell throughput, not raw provider row count. Include elapsed worker time, MAIN integration time, failures, retries, manual interventions, merge conflicts, memory high-water mark, remaining denominator, and a stated concurrency assumption.
