# Alabama County Audit Chunk 003

## Scope

This is the third Alabama county-audit chunk. It reviews the next `5` counties in the state checklist:

- Chilton
- Choctaw
- Clarke
- Clay
- Cleburne

## Findings

- All `5` counties in this chunk currently resolve to `complete-state-source-only`.
- Reviewed official ACES county office pages and official county category pages did not produce a county-specific public invasive-species list or detection report strong enough to use for these counties.
- This tranche reinforces the same Alabama pattern seen in chunks `1` and `2`: attributable county extension infrastructure is common, but county-specific invasive occurrence reporting remains much rarer than county office coverage.

## Contradictions Preserved

- County extension presence is not the same thing as county occurrence evidence. These counties all have legitimate local public source paths, but the reviewed sources still did not verify which invasive species are publicly reported from each county.
- The absence of a verified county-specific public list in this chunk does not mean these counties lack invasive species. It means the reviewed official public sources did not expose county-specific occurrence reporting that meets the current bar.
- Alabama still has a real split between narrow county-specific regulatory or detection notices and the much broader set of counties that only expose statewide education plus county office context.

## Progress Snapshot

- Audit chunks completed in this update: `1`
- Alabama counties: `67` total, `15` completed, `22.39%`
- Alabama chunks: `14` total, `3` completed, `21.43%`
- Nationwide counties in current 50-state audit set: `3141` total, `15` completed, `0.48%`
- Nationwide chunks at `5` counties each: `629` total, `3` completed, `0.48%`

## Recommendation

1. Continue Alabama sequentially into chunk `004` so the audit trail stays easy to verify.
2. Keep feeding reviewed counties into `src/data/source/county-details.ts` even when the result is still statewide-only, because that makes the user-facing county detail more honest.
3. Keep watching Alabama Department of Agriculture and Industries notices for narrow county-specific detections, since those remain the strongest local source type found so far.
