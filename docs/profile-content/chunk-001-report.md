# Chunk 1 Profile Report

## Scope

This first pass rewrote 10 flagship species profiles:

- Spotted Lanternfly
- Emerald Ash Borer
- Asian Longhorned Beetle
- Tree-of-Heaven
- Kudzu
- Giant Hogweed
- Hydrilla
- Sudden Oak Death
- Beech Leaf Disease
- Oak Wilt

The goal was not bulk coverage yet. The goal was to prove that the current profile layout can hold accurate, species-specific, action-oriented copy drawn from a compact set of reputable sources.

## Source Set

Chunk 1 relied on seven source institutions:

- USDA APHIS
- Penn State Extension
- National Park Service
- Maine Department of Agriculture, Conservation and Forestry
- Michigan Invasive Species Program
- New York State Department of Environmental Conservation
- Texas A&M Forest Service

This is a workable source base for the next phase because it stays small while still covering insects, invasive plants, and forest diseases with practical management guidance.

## What Improved

- Every rewritten profile now has tailored copy for Summary, Where it came from, Why it matters, What to look for, and What to do.
- Action guidance is no longer generic. Each profile now tells people whether the right move is direct control, reporting, or both.
- The first 10 profiles now point to official or extension-style sources instead of broad placeholder links.
- The content is written for normal users, not just specialists, while still preserving important distinctions such as quarantine risk, host materials, seasonal timing, and safety concerns.
- A reusable validation script now checks curated profile structure, source links, required action steps, and the no-em-dash rule.

## Quality Notes

- The strongest profiles in this chunk are the ones with a clear household action path, such as spotted lanternfly, giant hogweed, hydrilla, and oak wilt.
- Disease profiles are harder to write cleanly because the best public advice is often focused on reporting, sanitation, and movement restrictions rather than direct treatment.
- Some authoritative guidance is state-specific even when the species is national. That is acceptable for now if the advice is broadly accurate and clearly framed as a model for the kind of reporting or safety steps agencies expect.

## Gaps To Improve Before Chunk 2

- Add more direct extension or agency sources for species where one source page is thin.
- Build a research worksheet so each species is captured the same way before copy is drafted.
- Add a reviewer pass that compares the generated profile with the live rendered page, not just the seed data.
- Prefer one concrete observation cue, one concrete impact cue, and one concrete action cue in every section.
- Keep direct treatment advice conservative when a species is dangerous, regulated, or easy to misidentify.

## Recommended Rules For Chunk 2

- Keep each profile grounded in 1 to 2 primary public sources unless the species genuinely needs more.
- Prefer official agency, university extension, or public research program sources over secondary summaries.
- Make `What to look for` visual and specific.
- Make `Why it matters` ecological and practical.
- Make `What to do` explicit about whether people should remove, contain, avoid moving, document, or report.
- Keep all copy free of em dashes.

## Recommendation For The Next 100

Before moving to 100 profiles, the next step should be to create a lightweight research-to-copy workflow:

1. Pick the next species batch by public visibility, data coverage, and source availability.
2. Capture source notes in a structured format.
3. Draft copy into the seed data.
4. Run `npm run check:profiles`.
5. Build the site and spot-check rendered pages.

That should make the jump from 10 to 100 much more reliable without turning the profiles into boilerplate.
