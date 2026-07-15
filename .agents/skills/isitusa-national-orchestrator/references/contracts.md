# Orchestration Contracts

Read this file before creating or modifying durable orchestration state.

## Repository state

Store durable state under `ops/national-research/`:

- `owner.json`: exclusive MAIN ownership receipt
- `jobs.json`: planned jobs and their lifecycle state
- `leases.json`: immutable lease attempts with explicit recovery state
- `integration-queue.json`: worker results awaiting MAIN decisions
- `dashboard.json`: generated national progress and throughput snapshot
- `manifests/<job-id>.json`: worker completion manifests
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
  "expectedOutputs": ["manifest", "artifacts", "assertions", "reviews", "rejections", "outcomes", "receipt"],
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
