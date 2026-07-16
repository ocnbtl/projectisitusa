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
  "receipt": {"path": "relative/receipt.json", "sha256": "64 lowercase hex characters", "bytes": 1},
  "sourceVerification": {"path": "relative/source-verification.json", "sha256": "64 lowercase hex characters", "bytes": 1},
  "blockedItems": [],
  "counts": {
    "baseline": {"retainedArtifacts": 0, "retainedArtifactBytes": 0, "sourceRequests": 0, "providerCandidates": 0, "assertionEvents": 0, "publicationEligibleAssertions": 0, "reviewEvents": 0, "rejectionRecords": 0, "duplicateRecords": 0, "distinctOutcomePairs": 0, "completeOutcomePairs": 0, "evidenceFoundOutcomes": 0, "noQualifyingEvidenceOutcomes": 0, "errors": 0},
    "final": {"retainedArtifacts": 1, "retainedArtifactBytes": 1, "sourceRequests": 1, "providerCandidates": 1, "assertionEvents": 1, "publicationEligibleAssertions": 1, "reviewEvents": 1, "rejectionRecords": 0, "duplicateRecords": 0, "distinctOutcomePairs": 1, "completeOutcomePairs": 1, "evidenceFoundOutcomes": 1, "noQualifyingEvidenceOutcomes": 0, "errors": 0},
    "net": {"retainedArtifacts": 1, "retainedArtifactBytes": 1, "sourceRequests": 1, "providerCandidates": 1, "assertionEvents": 1, "publicationEligibleAssertions": 1, "reviewEvents": 1, "rejectionRecords": 0, "duplicateRecords": 0, "distinctOutcomePairs": 1, "completeOutcomePairs": 1, "evidenceFoundOutcomes": 1, "noQualifyingEvidenceOutcomes": 0, "errors": 0}
  },
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

Before acquisition, verify every pinned skill against both the checked-out tree and its declared Git commit when present. Both hashes use repository-relative file paths ordered by Unicode code point, with each path and file byte sequence separated by a null byte. Do not use locale-sensitive path ordering.

The worker validator locates the shared workspace dependency runtime from the linked worktree and passes that dependency root to the canonical validation child. Workers must not need a local dependency installation or a manually supplied `NODE_PATH`.

## Receipt and source-verification ownership

Use the closed project `run-receipt.schema.json` without worker extensions. The receipt carries the common immutable run identity, registered adapter provenance, parameters, requested scope, upstream request summaries, retained artifacts, declared outputs, common counts, errors, caveats, and rerun command.

Put worker-only metadata elsewhere:

- lease ID, attempt, retry and resume state, preflight history, exact operational counts, wall time, memory, and manual interventions belong in the manifest
- request purpose, request attempts, pagination completeness, source authority, terms, freshness, stable identity fields, geography policy, taxon policy, negative-evidence limits, and retained-evidence lineage belong in `source-verification.json`

`source-verification.json` must validate against `worker-source-verification.schema.json`. Its source, taxa, requests, retained-evidence descriptors, acquisition completeness, and negative-evidence claims must agree with the receipt and registered source. A complete receipt requires complete snapshot and pagination attestations.

It also carries the exact run ID, state code, ordered pair keys, and receipt parameter hash. Every request records `requestGroupId`, status, retrieval time, declared and received counts, plus a closed pagination object. Page indexes start at zero and remain contiguous. Offset and cursor chains cannot skip. A complete group has one terminal final page, and declared totals must equal received totals when a total is available.

The receipt must declare exactly one assertions, reviews, rejections, outcomes, and source-verification output for this worker contract. The manifest receipt and source-verification descriptors must match exact bytes and hashes. Extra, missing, duplicate, unchanged-but-reported, or changed-but-unreported worker files are validation failures.

## Cross-file identity rules

- `assertion.eventId` is the assertion primary key.
- `review.references.assertion_event_id` must equal one emitted assertion `eventId` byte for byte.
- `outcome.assertion_event_ids` contains those same assertion IDs.
- `rejection.rejection_id` is the rejection primary key.
- `outcome.rejection_ids` contains those same rejection IDs.
- receipt, source verification, assertions, reviews, rejections, and outcomes use one run, source, state, taxon, county-equivalent, and requested-pair identity.
- provider county and state text must resolve through the explicit registry to the declared county FIPS and state. Provider and target taxon names must satisfy the registered exact-match policy and catalog identity.
- agent actors equal the lease worker task ID, adapter actors equal `<adapter-id>@<adapter-version>`, and workers never claim human review authority.
- A positive completed screen uses `status: "evidence-found"`, `scope_complete: true`, at least one assertion ID, and at least one real query URL.
- the assertion IDs on `evidence-found` are exactly the final publication-eligible assertions for that pair after review resolution.
- A completed applicable screen with no qualifying evidence uses `status: "no-qualifying-evidence"`, `scope_complete: true`, no assertion IDs, and at least one real query URL.
- Failed, partial, ambiguous, interrupted, or unavailable work uses `needs-followup` or `blocked` with `scope_complete: false`.

Use the complete positive and rejection examples in [event-examples.md](event-examples.md). Do not invent shorter shapes.

## Prohibited outputs

Do not modify shared public or compatibility projections, state registries, shared schemas, compilers, app routes, package files, project skills, MAIN orchestration state, or deployment configuration. Put proposals in `sharedChangeProposals` and stop that scope.
