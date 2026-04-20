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

## Audit Rules

1. Prefer official agency, university extension, land-grant research, or similarly attributable public programs.
2. Treat county dashboards, county weed districts, county extension pages, local conservation districts, county GIS viewers, and county reporting portals as usable only when they are public, attributable, and specific enough to support county presence.
3. Do not promote a source into production until it is logged in [docs/source-inventory.md](/Users/ocean/Code/Project%20Isitusa/docs/source-inventory.md:1) with a clear purpose.
4. If a state has no county-level source, document that plainly instead of stretching a weak statewide page into county evidence.
5. Separate source discovery from pipeline adoption. A source can be "verified for research" before it is "approved for production use."

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

## Chunk Size

The current default county-audit chunk size is `5` counties.

That is intentionally smaller than the profile-writing chunks because county review requires state-by-state source checking, negative-find documentation, and cleaner progress accounting.

## Audit Sequence

1. Confirm statewide official invasive-species platforms for the state.
2. Check whether the state offers county-level lists, dashboards, maps, or downloadable records.
3. If statewide county evidence is weak, check county-level government, extension, weed-district, or conservation-district sources one county at a time.
4. Record what exists even when it is negative evidence, such as "no public county list found."
5. Only after the source path is clear should the data pipeline be reconsidered.

## Status Labels

- `not-started`: no meaningful source review yet
- `state-source-found`: statewide official source identified, county review not done
- `county-review-started`: county-by-county review has begun
- `county-source-found`: at least one county-specific public source verified
- `research-complete`: state and counties reviewed for currently available public sources
- `production-candidate`: source path looks strong enough to evaluate for data import or manual integration

County row statuses:

- `not-started`: county not reviewed yet
- `complete-state-source-only`: county reviewed, but no county-specific public invasive-species list or report was verified in the reviewed official sources
- `complete-county-source-found`: county reviewed and at least one county-specific public invasive-species source was verified

## Files

- [state-source-ledger.md](/Users/ocean/Code/Project%20Isitusa/docs/county-audit/state-source-ledger.md:1): statewide source tracker and first-tranche research notes
- `docs/county-audit/chunks/*.md`: county-audit chunk reports with progress snapshots
- [states/index.md](/Users/ocean/Code/Project%20Isitusa/docs/county-audit/states/index.md:1): 50-state county audit index
- `docs/county-audit/states/*.md`: one file per state with county checklist tables
- [county-detail-card-workflow.md](/Users/ocean/Code/Project%20Isitusa/docs/county-audit/county-detail-card-workflow.md:1): county summary, county card, and download preset rules
