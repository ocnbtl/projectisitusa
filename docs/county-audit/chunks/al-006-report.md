# Alabama County Audit Chunk 006

## Scope

This is the sixth Alabama county-audit chunk. It reviews the next `5` counties in the state checklist:

- Elmore
- Escambia
- Etowah
- Fayette
- Franklin

## Findings

- All `5` counties in this chunk currently resolve to `complete-state-source-only`.
- Reviewed official ACES county office pages and official county category pages did not produce a county-specific public invasive-species list or detection report strong enough to use for these counties.
- This tranche reinforces the same Alabama pattern seen in chunks `1` through `5`: local county extension infrastructure is common, but county-specific invasive occurrence reporting remains much rarer than county public-service presence.

## Contradictions Preserved

- County extension coverage is still not the same thing as county occurrence evidence. These counties all have legitimate local public source paths, but the reviewed sources still did not verify which invasive species are publicly reported from each county.
- The absence of a verified county-specific public list in this chunk does not mean these counties lack invasive species. It means the reviewed official public sources did not expose county-specific occurrence reporting that meets the current bar.
- Alabama still shows a split between a small number of narrow county-specific detections and a much larger set of counties that only expose statewide education plus county office context.

## Progress Snapshot

- Audit chunks completed in this update: `1`
- Alabama counties: `67` total, `30` completed, `44.78%`
- Alabama chunks: `14` total, `6` completed, `42.86%`
- Nationwide counties in current 50-state audit set: `3141` total, `30` completed, `0.96%`
- Nationwide chunks at `5` counties each: `629` total, `6` completed, `0.95%`

## Recommendation

1. Continue Alabama sequentially into chunk `007` so the audit trail stays easy to verify.
2. Keep writing reviewed statewide-only counties into `src/data/source/county-details.ts` so the user-facing county summaries stay honest about local evidence limits.
3. Broaden the next pass beyond ACES and Alabama Department of Agriculture and Industries notices by checking forestry, wildlife, aquatic nuisance species, and other authoritative source families before closing a county as statewide-only.
