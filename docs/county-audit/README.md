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

## Files

- [state-source-ledger.md](/Users/ocean/Code/Project%20Isitusa/docs/county-audit/state-source-ledger.md:1): statewide source tracker and first-tranche research notes
- [states/index.md](/Users/ocean/Code/Project%20Isitusa/docs/county-audit/states/index.md:1): 50-state county audit index
- `docs/county-audit/states/*.md`: one file per state with county checklist tables
