# Question-aware research assessments

The question assessment axis extends the existing immutable evidence ledger. It never writes county-species biological determinations. Source screens, protocol cells, non-detections, and determinations remain separate metrics.

## Dated DC pilot

The first policy, `dc-question-pilot-20260906`, declares four required questions for all 2,504 catalog species in the District of Columbia. Its denominator is 10,016 questions and 2,504 pairs. The historical question ends on 2026-09-06; wild occurrence and establishment cover 2026-01-01 through 2026-09-06. Official absence or eradication is assessed as of 2026-09-06. A later projection does not silently extend these periods.

Only actual assessment events are persisted. Unassessed catalog questions resolve through the dated policy without thousands of duplicated empty rows. A supported historical answer does not complete the wild occurrence, establishment, or official-status questions. Full pair research completion requires every required question to have a valid assessment.

The initial policy activates supported answers only. It does not activate an establishment reader or a finite unresolved source-review reader. Those questions remain outstanding. This pilot does not claim full research completion or create new determinations.

## Evaluated witness methods

- `accepted-occurrence-ledger-v1` refines an existing, publication-eligible occurrence or preserved-specimen assertion into documented historical occurrence. The source, adapter and version must be explicitly allowed by the policy. Regulatory quarantine geography is excluded. Missing source dates remain unknown. An explicit invalid or future source date is held for review rather than rewritten.
- `retained-inaturalist-wild-period-v1` reopens the hash-checked retained GBIF JSON, requires exactly one matching occurrence identity, and reproduces its existing normalized payload with the source adapter's own normalization function. Its explicit wild field, human-observation basis, positive occurrence status, canonical species, and valid date must match the accepted assertion and declared period. One observation does not establish a breeding population, abundance, countywide occupancy, or continued presence.
- `approved-jurisdiction-status-v1` uses the existing reviewed jurisdiction registry, its exact county scope and validity window, and the existing temporal conflict resolver. It retains original authority documents. A national eradication statement does not imply a previous occurrence in every county.

These methods use already registered, retained evidence. They make no new network requests. Their artifacts cite original assertions, accepted review events, immutable source receipts, relevant retained payloads, and authority documents. National acquisition reference artifacts retain their original archive lineage; the historical refinement does not claim to reacquire or independently rerun every original archive adapter.

The first DC review identified a NAS assertion for `mesocyclops-pehpeiensis` dated `1996-06-31`. Its new historical assessment is held pending source-date review. This hold does not retract the existing biological occurrence determination.

## Finite unresolved completion contract

The general contract accepts `assessed-unresolved` and `assessed-with-gaps` only under an explicit question-specific plan. Each finite branch must cover every declared source obligation and include an evaluated, targeted contradiction review. An access gap needs its own reviewed proof and remains visibly different from an accessible plan completed without an answer. Neither disposition contains a biological answer.

A generic `scope_complete: true`, source omission, rejected candidate, query failure, or empty result cannot create these proofs. New finite source-review methods require source-specific artifact readers and adversarial evaluation before activation in a policy. Relevant sources and justified stopping rules must be defined before applying the branch; do not omit a required source simply to increase completion.

Inference is not implemented by this contract. A future inferred-absence method needs its own validated scope, uncertainty, calibration and caveats. It cannot use the verified-absence label.

## Immutable assessment history and reopening

`research-questions.json` is the current dated policy. Plans, proofs and assessment events live in immutable batch directories under `src/data/research/question-assessments/<batch-id>/`. Each receipt pins the method commit, policy hash, source receipt hashes and exact output bytes. Proof and assessment IDs derive from their full content.

Each plan hash binds question predicates, periods, catalog identity, registered county scope, method version, stopping rules and reopening conditions. Corrections append events with explicit supersession. Prior batches are preserved. Changed plans or invalidated witnesses reopen questions rather than manufacturing a replacement answer.

Compilation verifies retained file hashes and resolves source assertions through the existing publication review gates. It reproduces each active proof from current accepted inputs. A new valid witness does not invalidate an older still-valid witness merely because a different record sorts first. Unanswered or reopened questions remain visible in the public page, with supported answers linked to original sources.

## Commands and integration

- `npm run check:question-assessments` validates the contract, retained source readers, presentation and any integrated batch projection.
- `npm run research:questions:preview -- --state DC --as-of 2026-09-06 --campaign <unique-preview-id>` creates an ignored preview. Preview code may be dirty and is never an admission receipt.
- `npm run research:questions:stage -- --state DC --as-of 2026-09-06 --campaign <unique-batch-id>` requires committed method code and writes an ignored immutable staging directory.
- MAIN reviews staged plans, output hashes, exact counts, source exceptions and semantic checks before moving the four immutable files to the canonical ledger. The staging evaluation remains a separate operational receipt.
- MAIN compiles and verifies the affected state, inspects public and generated diffs, and reconciles biological counts before committing. App and R2 release cadence and capacity checks remain unchanged.

The compiler emits optional question metadata in existing version-4 state and county projections. Older projections remain readable. The research page labels legacy coverage as source-screen coverage and displays question assessment coverage independently. Local assessment progress is not public until its data release is verified.
