# Source Inventory

This file tracks the external sources currently used by Project Isitusa, what each source is used for, where that data lands in the repo, and when it was last fetched or consulted.

If you add a new data or content source, update this file in the same change.

## Core Structured Data Sources

| Source | Used for | Repo artifacts | How acquired | Last tracked fetch or use |
| --- | --- | --- | --- | --- |
| US-RIIS v2 lower-48 invasive species snapshot, U.S. Geological Survey, DOI: https://doi.org/10.5066/P9KFFTOD | Core registry catalog, taxonomy, status, habitats, pathways, intro year, authority name, authority URL, occurrence IDs | `src/data/source/usriis-snapshot.json`, `src/data/generated/species.json`, `public/generated/species.json`, `src/data/generated/explorer-species.json`, `public/generated/explorer-species.json` | `scripts/import-usriis.ts` downloads the ScienceBase ZIP and parses `USRIISv2_MasterList.csv` | `2026-04-15T00:49:36.752Z` |
| EDDMapS, Early Detection and Distribution Mapping System, https://www.eddmaps.org/ | County-level invasive species presence, mainly for manually curated species and for merged county coverage | `src/data/source/eddmaps-snapshot.json`, `src/data/source/county-presence-snapshot.json` | `scripts/import-eddmaps.ts` and `scripts/import-county-presence.ts` call EDDMapS county and subject endpoints | `2026-04-14T23:30:32.151Z`, then merged on `2026-04-15T01:21:30.922Z` |
| USGS Nonindigenous Aquatic Species, https://nas.er.usgs.gov/ | County-level occurrence support for aquatic and related mapped species in the merged county snapshot | `src/data/source/county-presence-snapshot.json` | `scripts/import-county-presence.ts` queries NAS species and occurrence APIs | Access date recorded in snapshot citation as `2026-04-14`, merged on `2026-04-15T01:21:30.922Z` |
| `us-atlas` county topology package | County geometry used to normalize county matches and power map geometry in the app | Imported through `scripts/import-county-presence.ts` and runtime map code | Installed as an npm dependency, not fetched by a custom project importer | Exact acquisition date is not currently tracked in repo data files |

## Registry-Derived Authority Links

Many registry species pages expose an `Authority source` link. These links are carried through from US-RIIS `WebLink` values during `scripts/build-data.ts`.

- Used for: giving contributors and readers an upstream authority pointer for registry species
- Important limit: these authority URLs are not yet manually reviewed one by one
- Contributor guidance: treat them as upstream references, not as fully curated profile sources

## Image Sources

| Source | Used for | Repo artifacts | How acquired | Last tracked fetch or use |
| --- | --- | --- | --- | --- |
| Wikidata exact scientific-name match with Wikimedia Commons image property (P18) | Primary image acquisition path for catalog species | `src/data/source/species-image-manifest.json`, `public/species/catalog/*` | `scripts/import-species-images.ts` queries Wikidata, resolves Commons file paths, and downloads a web-sized image | `src/data/source/species-image-manifest.json` updated at `2026-04-15T09:04:34.342Z` |
| iNaturalist exact scientific-name taxon match fallback with commercially reusable license allowlist | Secondary image fallback when Wikidata does not produce a safe exact match | `src/data/source/species-image-manifest.json`, `public/species/catalog/*` | `scripts/import-species-images.ts` queries iNaturalist taxa and downloads only allowlisted licenses | `2026-04-15T09:04:34.342Z` |
| GBIF exact or accepted exact scientific-name match with still-image occurrence media fallback and commercially reusable license allowlist | Tertiary image fallback when Wikidata and iNaturalist do not produce a safe match | `src/data/source/species-image-manifest.json`, `public/species/catalog/*` | `scripts/import-species-images.ts` queries GBIF species and occurrence media | `2026-04-15T09:04:34.342Z` |
| Curated hero images stored directly in `src/data/source/species.ts` | Hero and lead images for curated profiles | `src/data/source/species.ts`, generated species JSON, top-level files under `public/species/` | Manually selected and stored in repo | Several legacy curated image credits are present, but source URLs and original acquisition timestamps are not yet tracked in one place |

## Curated Profile Content Sources

This section tracks sources used to write or maintain the hand-written species profiles in `src/data/source/species.ts`.

### Chunk 1, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aphis.usda.gov/plant-pests-diseases/slf | Spotted Lanternfly | Summary, visual ID cues, host impacts, travel and reporting guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/eab | Emerald Ash Borer | Symptoms, impact framing, reporting path, wood movement guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/alb/check-trees/about-alb | Asian Longhorned Beetle | Beetle description, host context, reporting guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/alb/check-trees/signs-alb | Asian Longhorned Beetle | Exit holes, egg sites, frass, other infestation cues |
| https://extension.psu.edu/tree-of-heaven | Tree-of-Heaven | ID cues, spread pattern, why the species matters |
| https://extension.psu.edu/tree-of-heaven-control-strategies | Tree-of-Heaven | Action section, root-focused control guidance, follow-up expectations |
| https://www.nps.gov/neri/learn/nature/kudzu.htm | Kudzu | Visual ID, growth pattern, ecological impact, repeat-control guidance |
| https://www.maine.gov/dacf/php/horticulture/gianthogweed.shtml | Giant Hogweed | Safety, action steps, reporting expectations, human-health risk |
| https://www1.maine.gov/dacf/php/horticulture/hogweedlookalikes.shtml | Giant Hogweed | Look-alike caution and identification guardrails |
| https://www.michigan.gov/invasives/id-report/plants/aquatic/hydrilla | Hydrilla | ID details, spread pathways, prevention, reporting guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/pramorum | Sudden Oak Death | Host range, symptoms, plant movement restrictions, diagnosis framing |
| https://dec.ny.gov/nature/forests-trees/forest-health/beech-leaf-disease | Beech Leaf Disease | Visual symptoms, forest impact, documentation and reporting guidance |
| https://dec.ny.gov/nature/forests-trees/forest-health/oak-wilt | Oak Wilt | Symptoms, wound prevention, reporting path |
| https://tfsweb.tamu.edu/trees/tree-health/diseases/texas-oak-wilt/ | Oak Wilt | Management framing, timing context, practical response guidance |

### Pre-existing curated profile sources observed in repo on 2026-04-16

These sources are already referenced by current curated profiles, but the original research date was not tracked before the source inventory existed.

| Source URL | Species using it | Used for | Tracking note |
| --- | --- | --- | --- |
| https://www.aphis.usda.gov/operational-wildlife-activities/feral-swine | Feral Swine | Current curated profile copy and contact link | Observed in repo on `2026-04-16`; original consult date unknown |
| https://www.fws.gov/program/invasive-species | Nutria, Northern Snakehead | Current broad federal reference link | Observed in repo on `2026-04-16`; should be replaced with species-specific sources during those rewrites |
| https://www.eddmaps.org/ | Feral Swine, Nutria, Northern Snakehead | Broad mapping reference in current curated profile sources | Observed in repo on `2026-04-16`; should be replaced with more targeted profile sources during those rewrites |

## Contributor Rules

1. Prefer official agency, university extension, or public research program sources for curated profile writing.
2. Log every new source the same day you use it.
3. Record the actual date you fetched or consulted the source when that information is available.
4. If the exact date is unknown, say so plainly instead of inventing one.
5. When a source is only carried through from upstream data, label it as upstream-derived rather than curated.
