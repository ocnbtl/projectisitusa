# Profile Workflow

This document defines the quality-first loop for scaling curated species profiles.

## Tension To Resolve

There is a direct tension between the original batch-size target of `10 -> 100 -> 500 -> remainder` and the requirement that profiles remain genuinely useful, species-specific, source-backed, and readable.

The current resolution is:

- Treat the next `100` as a tranche, not as one giant drafting pass
- Execute that tranche as smaller sub-batches of `25`
- Run a review and process-adjustment step after each sub-batch

This keeps the original scaling direction intact while protecting quality.

## Selection Rules

Choose species for the next sub-batch using all of the following:

1. Public relevance: the species is likely to matter to normal users, landowners, gardeners, anglers, foresters, or local communities.
2. Data readiness: the species already has an image and useful county or range context in the app.
3. Source readiness: at least one solid primary public source exists, preferably two.
4. Category mix: keep a balance across plants, insects, diseases, and wildlife when possible.
5. Action clarity: the species has some practical public action pathway, even if that pathway is mainly to report and avoid spreading it.

Do not prioritize a species only because it has a huge county count. High coverage without strong public value usually produces lower-signal profiles.

## Research Rules

For each species:

1. Start with 1 to 2 primary sources, usually an agency or extension page.
2. Capture the notes in the research template before writing final copy.
3. Pull one concrete identification cue, one concrete impact cue, and one concrete action cue from the source notes.
4. Add a second source only if the first source is too thin or too narrow.
5. Update `docs/source-inventory.md` on the same day the source is used.

## Writing Rules

Each curated profile must have:

- A species-specific `Summary`
- A `Where it came from` section grounded in known introduction context
- A `Why it matters` section that explains both ecological and practical consequences
- A `What to look for` section with specific, visual cues
- A `What to do` section that clearly signals whether the user should remove, contain, avoid moving, document, report, or call a professional

Additional rules:

- No em dashes
- No generic copy pasted paragraphs across multiple species
- No overconfident treatment advice when a species is dangerous, regulated, or easy to misidentify
- No vague action steps such as `contact local officials` without context

## Validation Loop

After drafting a sub-batch:

1. Update `src/data/source/species.ts`
2. Run `npm run check:profiles`
3. Run `npm run prepare:data`
4. Run `npm run build`
5. Spot-check the rendered pages for the batch
6. Write a short chunk report covering quality, misses, and next improvements

## Definition Of Done

A profile sub-batch is done only when:

- Source inventory is updated
- Curated copy is complete for every selected species
- Validation passes
- Build passes
- A chunk report records lessons for the next loop
