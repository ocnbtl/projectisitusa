# Evidence Worker Contract

Read this file before acquisition, review, or manifest creation.

## Status semantics

Keep these results distinct:

| Result | Minimum support | Never infer from |
| --- | --- | --- |
| Verified present | Reputable exact taxon and approved county evidence | Coordinate-only routing without approved policy |
| Verified absent | Explicit authoritative exact species, county, time, and scope absence statement | Missing list entry, empty query, rejected records |
| Not detected | Explicit target, geography, time, method, effort, and negative survey result | No occurrences, failed request, incomplete sampling |
| Researched unresolved | Completed applicable source scope with no qualifying determination evidence | Unattempted, failed, or incomplete scope |
| Not researched | No completed applicable source screen | Any assumption about likely presence or absence |

An outcome of `no-qualifying-evidence` requires at least one real query or documented applicable-source screen, complete declared pagination or coverage, no retryable failure, and `scope_complete: true`. It creates research progress only.

Use `blocked` or `needs-followup` with `scope_complete: false` for unavailable sources, partial pagination, stale source requiring a current substitute, ambiguous taxon, missing geography, terms restrictions, artifact limit, interruption, request failure, or shared-schema need.

## Assertion checks

Every assertion must include exact source, run, species, county, record locator, direct URL or retained artifact reference, retrieval time, taxon match, geography match, temporal scope, spatial scope, normalized payload hash, caveats, and review lineage.

For `officially-absent`, require:

- `evidence_kind` equal to `absence-statement`
- county or explicitly authoritative county-equivalent scope
- source text or structured field explicitly stating absence
- exact target taxon
- stated time and scope
- source registry capability for authoritative negative evidence

For `not-detected`, require:

- `evidence_kind` equal to `survey-non-detection`
- nonempty survey scope
- target, geography, survey time, method or program, effort, and explicit negative result in retained structured evidence
- no countywide absence claim derived from finer sampling
- source registry capability for explicit survey negatives

Provider silence, `itemCount: 0`, HTTP failure, parse failure, missing county, rejected candidate, duplicate, or scope guard can never support either negative claim.

## Rejection checks

Use stable reason codes. Preserve materially considered candidates. A rejection can explain taxon mismatch, geography ambiguity, outside scope, cultivated or captive context, failed record, contradiction, duplicate, insufficient negative scope, or unsupported claim type.

A rejection does not complete a pair by itself and never changes determination or survey status.

## Resume checks

Record:

- last successful page or cursor
- stable ordering and snapshot field when available
- declared and received row counts
- seen record IDs or deterministic duplicate strategy
- artifact path and hash
- next request parameters
- whether retry can safely reuse the artifact

On retry, verify retained artifact hashes and parameters before resuming. Do not duplicate accepted event IDs. Preserve repeat-run events with unique run-scoped IDs while allowing deterministic projection deduplication.

## Manifest shape

The manifest requires:

```json
{
  "schemaVersion": 1,
  "jobId": "job-id",
  "leaseId": "lease-id",
  "status": "complete",
  "branch": "codex/job-id",
  "worktree": "/absolute/worktree",
  "baseSha": "40 lowercase hex characters",
  "commitSha": "40 lowercase hex characters",
  "skillPins": [],
  "sourceParameters": {},
  "artifacts": [{"path": "relative/path", "sha256": "64 lowercase hex characters", "bytes": 1}],
  "assertions": [{"path": "relative/assertions.ndjson", "count": 1}],
  "reviews": [{"path": "relative/reviews.ndjson", "count": 1}],
  "rejections": [{"path": "relative/rejections.ndjson", "count": 0}],
  "outcomes": [{"path": "relative/outcomes.ndjson", "count": 1}],
  "blockedItems": [],
  "counts": {"baseline": {"evidence": 0}, "final": {"evidence": 1}, "net": {"evidence": 1}},
  "verificationCommands": [{"command": "git diff --check <lease-base-sha>...HEAD", "exitCode": 0, "result": "pass"}],
  "retryResume": {"attempt": 1, "retryable": false, "resumeToken": null, "remainingRequests": []},
  "remainingWork": [],
  "sharedChangeProposals": [],
  "performance": {"wallSeconds": 1, "peakMemoryMb": 1, "validPairsScreened": 1, "manualInterventions": 0},
  "semanticAttestation": {"sourceSilenceCreatedNegative": false, "failedRequestCreatedNegative": false, "rejectionCreatedNegative": false, "missingGeographyCreatedDetermination": false, "incompleteScopeMarkedComplete": false}
}
```

Use `partial`, `blocked`, or `failed` when completion criteria are not met. A complete manifest must have no remaining requested scope and all required verification commands must pass.

A complete manifest must record the exact `git diff --check <lease-base-sha>...HEAD` command. The validator independently reruns that committed-range check plus unstaged and staged whitespace checks. Store provider-controlled raw bytes only under repository-declared binary artifact patterns. Never change source bytes to make a whitespace gate pass.

`commitSha` is the non-base commit that contains the evidence outputs. Commit the finalized manifest in a second commit and return that branch HEAD separately. The content commit must be an ancestor of branch HEAD.

## Cross-file identity rules

- `assertion.eventId` is the assertion primary key.
- `review.references.assertion_event_id` must equal one emitted assertion `eventId` byte for byte.
- `outcome.assertion_event_ids` contains those same assertion IDs.
- `rejection.rejection_id` is the rejection primary key.
- `outcome.rejection_ids` contains those same rejection IDs.
- A positive completed screen uses `status: "evidence-found"`, `scope_complete: true`, at least one assertion ID, and at least one real query URL.
- A completed applicable screen with no qualifying evidence uses `status: "no-qualifying-evidence"`, `scope_complete: true`, no assertion IDs, and at least one real query URL.
- Failed, partial, ambiguous, interrupted, or unavailable work uses `needs-followup` or `blocked` with `scope_complete: false`.

Use the complete positive and rejection examples in [event-examples.md](event-examples.md). Do not invent shorter shapes.

## Prohibited outputs

Do not modify shared public or compatibility projections, state registries, shared schemas, compilers, app routes, package files, project skills, MAIN orchestration state, or deployment configuration. Put proposals in `sharedChangeProposals` and stop that scope.
