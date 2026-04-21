# Alabama County Audit Chunk 013

## Scope

This is the thirteenth Alabama county-audit chunk. It reviews the next `5` counties in the state checklist:

- Talladega
- Tallapoosa
- Tuscaloosa
- Walker
- Washington

## Findings

- `Talladega`, `Tallapoosa`, and `Tuscaloosa` resolve to `complete-county-source-found`.
- `Walker` and `Washington` currently resolve to `complete-state-source-only`.
- Talladega and Tuscaloosa both surfaced county-specific evidence that was strong enough to support county-detail upgrades and clean manual county-presence fixes.
- Tallapoosa did surface county-specific carp records, but the observed status in the reviewed records is weaker than an established county record, so it was used for county-detail evidence rather than a production coverage override.

## Contradictions Preserved

- Walker is the key contradiction in this chunk. A county-specific nonnative freshwater jellyfish record surfaced, but that taxon is outside the current Project Isitusa catalog and the reviewed status signal is too weak for production invasive coverage, so Walker stays statewide-only.
- Washington staying `statewide-only` does not mean the county lacks invasive species. It means the broader-source pass still did not surface county-specific invasive reporting strong enough for production use.
- Tallapoosa now has county-specific evidence, but it is still weaker than an established county occurrence and should stay described that way.

## Progress Snapshot

- Audit chunks completed in this update: `1`
- Alabama counties: `67` total, `65` completed, `97.01%`
- Alabama chunks: `14` total, `13` completed, `92.86%`
- Nationwide counties in current 50-state audit set: `3141` total, `65` completed, `2.07%`
- Nationwide chunks at `5` counties each: `629` total, `13` completed, `2.07%`

## Recommendation

1. Finish Alabama with chunk `014` immediately after this tranche so the statewide audit reaches a clean documented stopping point.
2. Preserve the Walker contradiction explicitly until the catalog or source stack changes enough to justify a production invasive claim.
3. Treat Tallapoosa as a county-specific but weaker-evidence county rather than flattening it into the same confidence tier as Talladega or Tuscaloosa.
