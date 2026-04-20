# Alabama County Audit Chunk 005

## Scope

This is the fifth Alabama county-audit chunk. It reviews the next `5` counties in the state checklist:

- Crenshaw
- Cullman
- Dale
- Dallas
- DeKalb

## Findings

- All `5` counties in this chunk currently resolve to `complete-state-source-only`.
- Reviewed official ACES county office pages and official county category pages did not produce a county-specific public invasive-species list or detection report strong enough to use for these counties.
- This tranche reinforces the same Alabama pattern seen in chunks `1` through `4`: local county extension infrastructure is common, but county-specific invasive occurrence reporting remains much rarer than county public-service presence.

## Contradictions Preserved

- County extension coverage is still not the same thing as county occurrence evidence. These counties all have legitimate local public source paths, but the reviewed sources still did not verify which invasive species are publicly reported from each county.
- The absence of a verified county-specific public list in this chunk does not mean these counties lack invasive species. It means the reviewed official public sources did not expose county-specific occurrence reporting that meets the current bar.
- Alabama still shows a split between a small number of narrow county-specific detections and a much larger set of counties that only expose statewide education plus county office context.

## Progress Snapshot

- Audit chunks completed in this update: `1`
- Alabama counties: `67` total, `25` completed, `37.31%`
- Alabama chunks: `14` total, `5` completed, `35.71%`
- Nationwide counties in current 50-state audit set: `3141` total, `25` completed, `0.80%`
- Nationwide chunks at `5` counties each: `629` total, `5` completed, `0.79%`

## Recommendation

1. Continue Alabama sequentially into chunk `006` so the audit trail stays easy to verify.
2. Keep writing reviewed statewide-only counties into `src/data/source/county-details.ts` so the user-facing county summaries stay honest about local evidence limits.
3. Keep watching Alabama Department of Agriculture and Industries notices for narrow county-specific detections, because those remain the strongest local source type verified so far.
