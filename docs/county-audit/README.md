# County Audit Framework

## Purpose

This audit track exists to improve county-level invasive-species accuracy without lowering the source standard.

The goal is not to invent county presence from assumptions. The goal is to verify whether each state, and then each county inside that state, has publicly accessible official or academic reporting that is strong enough to refine Project Isitusa's county display.

## Important Contradiction To Preserve

The project already has county geometry and county records for all `50` states in [src/data/generated/counties.json](/Users/ocean/Code/Project%20Isitusa/src/data/generated/counties.json:1), plus District of Columbia and several territories.

That means the current gap is not county-list coverage or map geometry.

The real gap is source completeness and reporting quality:

- some states still have thin invasive-species source stacks
- some counties may have stronger local reporting than the current merged statewide or federal inputs capture
- wildlife is a likely underreported category in several states and counties

Another contradiction matters here too:

- a statewide source can be good enough to anchor narrative context without being integrated into the county-presence map
- a county audit can improve county summaries and resources without adding a single new mapped county if the source never reaches the import pipeline

The Alabama audit made that gap concrete on 2026-04-20, when the generated county-presence snapshot still contained `0` mapped Alabama counties even though Alabama already had a documented statewide source path and reviewed county source notes. That contradiction was partly resolved on 2026-04-23 by supplementing county coverage from the USGS NAS Darwin Core archive, then reduced further the same day by two vetted SERNEC Alabama plant tranches, the official Alabama Forestry Commission cogongrass GIS county layer, the public APHIS emerald ash borer county layer, and the public laurel wilt county layer. Alabama now has statewide live county map coverage backed by county-specific evidence in every county and a materially broader county-species picture, but many counties still rely on narrower plant, forest-pest, or aquatic signals rather than broad county invasive-species inventories.

## Audit Rules

1. Prefer official agency, university extension, land-grant research, or similarly attributable public programs.
2. Treat county dashboards, county weed districts, county extension pages, local conservation districts, county GIS viewers, and county reporting portals as usable only when they are public, attributable, and specific enough to support county presence.
3. Do not promote a source into production until it is logged in [docs/source-inventory.md](/Users/ocean/Code/Project%20Isitusa/docs/source-inventory.md:1) with a clear purpose.
4. If a state has no county-level source, document that plainly instead of stretching a weak statewide page into county evidence.
5. Separate source discovery from pipeline adoption. A source can be "verified for research" before it is "approved for production use."
6. Do not stop at one source family when a county comes up thin. Search across state agencies, agriculture departments, forestry agencies, wildlife agencies, county government, extension, conservation districts, regulatory notices, dashboards, GIS viewers, and credible academic programs before calling the county reviewed.
7. County audit is not only a documentation task. It should also look for statewide or regional datasets that could actually reduce gray counties in production when county-level sources are missing.

## Qualification Tiers

### Evidence that qualifies for county occurrence claims

- Official county-specific detection notices from state or federal agencies
- County quarantine or regulatory notices tied to a named invasive species
- County invasive-species lists, dashboards, or map viewers from an official public source
- County extension, weed-district, conservation-district, or county-government pages that explicitly name invasive species present in that county
- County GIS viewers or downloadable public records that clearly show county occurrence

### Evidence that does not qualify by itself

- A county extension office homepage with no county occurrence claim
- Event listings, outreach calendars, or staff directories
- Annual reports that mention invasive plant work, aquatic weed work, or pest-management programming without naming county occurrence
- Statewide educational pages that mention county contacts but not county occurrence
- General invasive-species education pages with no county-specific reporting

### Adoption gates

1. A county page may cite a county-specific claim only when it has qualifying evidence.
2. County summaries may mention statewide-only conditions, but they must not imply a county occurrence list that has not been verified.
3. County cards may always use Project Isitusa-derived stats such as mapped species count, nearby watchlist count, and unresolved coverage count.
4. County cards may mention local organizations or county-specific detections only when those references exist in the curated county-detail dataset.
5. Negative evidence is still useful. "No county-specific public list found" is a valid audit result and should be documented plainly.
6. A statewide source may still be valuable even when it does not justify a county occurrence claim, but it must be labeled as a statewide fallback rather than silently treated like county proof.
7. If a county remains gray in production, the audit should explicitly ask whether the problem is lack of source discovery, lack of importable structure, or lack of pipeline adoption.

## Chunk Size

The current default county-audit chunk size is `5` counties.

That is intentionally smaller than the profile-writing chunks because county review requires state-by-state source checking, negative-find documentation, and cleaner progress accounting.

## Audit Sequence

1. Confirm statewide official invasive-species platforms for the state.
2. Check whether the state offers county-level lists, dashboards, maps, downloadable records, or structured statewide datasets that can be normalized down to counties.
3. If statewide county evidence is weak, search county-level government, extension, weed-district, conservation-district, regulatory, and GIS sources one county at a time.
4. If the county path is still thin, broaden the search to other reputable state and regional systems before closing the county as statewide-only.
5. Record what exists even when it is negative evidence, such as "no public county list found."
6. Record whether the best source found is:
   - county-specific and usable for occurrence claims
   - statewide-only and useful for narrative fallback
   - structured enough to evaluate for pipeline import
7. After the source path is clear, decide whether a pipeline follow-up is needed to reduce gray counties in production.

## Pipeline Validation

After source imports, manual county-presence overrides, non-presence status overrides, or generated matrix changes, run the focused data-integrity checker:

```bash
npm run check:data-integrity
```

The checker verifies generated species IDs and slugs, runtime presence rows, explorer presence indexes, source snapshot county FIPS values, source-family counts, manual presence overrides, non-presence status overrides, and the Alabama county-species matrix summary. It is meant to catch source-count drift, broken IDs, invalid county FIPS values, and status conflicts before generated JSON diffs are committed.

## Status Labels

- `not-started`: no meaningful source review yet
- `state-source-found`: statewide official source identified, county review not done
- `county-review-started`: county-by-county review has begun
- `county-source-found`: at least one county-specific public source verified
- `research-complete`: state and counties reviewed for currently available public sources
- `research-complete-coverage-in-progress`: county audit is complete and production coverage improved, but denominator reconciliation and source-family adoption are still active
- `production-candidate`: source path looks strong enough to evaluate for data import or manual integration

County row statuses:

- `not-started`: county not reviewed yet
- `complete-state-source-only`: county reviewed, but no county-specific public invasive-species list or report was verified in the reviewed official sources
- `complete-county-source-found`: county reviewed and at least one county-specific public invasive-species source was verified

Important limitation:

`complete-state-source-only` does not mean the county is visually covered in the map. It only means the audit found no county-specific qualifying evidence and is currently relying on statewide context unless or until a stronger county or importable fallback dataset is adopted.

## Files

- [state-source-ledger.md](/Users/ocean/Code/Project%20Isitusa/docs/county-audit/state-source-ledger.md:1): statewide source tracker and first-tranche research notes
- `docs/county-audit/chunks/*.md`: county-audit chunk reports with progress snapshots
- [states/index.md](/Users/ocean/Code/Project%20Isitusa/docs/county-audit/states/index.md:1): 50-state county audit index
- `docs/county-audit/states/*.md`: one file per state with county checklist tables
- [county-detail-card-workflow.md](/Users/ocean/Code/Project%20Isitusa/docs/county-audit/county-detail-card-workflow.md:1): county summary, county card, and download preset rules
- [../county-coverage/README.md](/Users/ocean/Code/Project%20Isitusa/docs/county-coverage/README.md:1): county-species status matrix framework for tracking verified present, verified absent, not-detected, and unknown determinations toward the 90 percent county target
