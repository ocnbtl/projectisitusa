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

### Chunk 2A pilot, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aphis.usda.gov/plant-pests-diseases/japanese-beetle | Japanese Beetle | Origin, host breadth, visual ID, movement concerns |
| https://extension.umn.edu/node/11076 | Japanese Beetle | Early action timing, hand removal, grub and yard management framing |
| https://extension.psu.edu/brown-marmorated-stink-bug | Brown Marmorated Stink Bug | Home invasion behavior, crop risk, exclusion and removal guidance |
| https://cals.cornell.edu/new-york-state-integrated-pest-management/outreach-education/whats-bugging-you/brown-marmorated-stink-bug | Brown Marmorated Stink Bug | Indoor nuisance framing, visual ID, exclusion and vacuum guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/spongy-moth | Spongy Moth | Egg-mass ID, caterpillar ID, quarantine and self-inspection guidance |
| https://cals.cornell.edu/integrated-pest-management/outreach-education/whats-bugging-you/spotted-wing-drosophila | Spotted-wing Drosophila | Fruit injury, fly ID, trap and harvest guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/ifa | Red Imported Fire Ant | Mound ID, sting risk, quarantine and commodity movement guidance |
| https://extension.umn.edu/plant-diseases/dutch-elm-disease | Dutch Elm Disease | Symptoms, bark beetle spread, root-graft spread, pruning and arborist guidance |
| https://extension.psu.edu/chestnut-diseases | Chestnut Blight | Canker symptoms, spore signs, removal guidance |
| https://www.nps.gov/articles/ecological-threats-plants-animals.htm | Chestnut Blight | Forest impact, introduction pathway, ecosystem consequence framing |
| https://extension.umn.edu/identify-invasive-species/multiflora-rose | Multiflora Rose | Identification, reporting context, seed longevity, spread cues |
| https://extension.psu.edu/multiflora-rose-control-in-pastures/ | Multiflora Rose | Integrated control and repeat-treatment guidance |
| https://www.nps.gov/cuva/learn/nature/japanese-honeysuckle.htm | Japanese Honeysuckle | ID, spread pattern, control methods |
| https://www.nps.gov/articles/000/cheatgrass.htm | Cheatgrass | ID, fire-cycle impact, seed spread and prevention framing |
| https://extension.psu.edu/the-noxious-persistent-invasive-and-perennial-bindweeds | Field Bindweed | ID cues, persistence, root and rhizome management cautions |
| https://extension.umn.edu/identify-invasive-species/garlic-mustard | Garlic Mustard | ID, hand-pull timing, reporting and spread prevention |
| https://www.nps.gov/cuva/learn/nature/garlic-mustard.htm | Garlic Mustard | Forest impact, biennial life cycle, bagging guidance |
| https://www.nps.gov/cuva/learn/nature/purple-loosestrife.htm | Purple Loosestrife | ID, wetland impact, hand-pull vs larger-treatment framing |
| https://www.fws.gov/media/purple-loosestrife | Purple Loosestrife | Wetland habitat consequence framing |
| https://www.usgs.gov/faqs/what-are-zebra-mussels-and-why-should-we-care-about-them | Zebra Mussel | Spread pathway, ecosystem and infrastructure impact |
| https://extension.umn.edu/identify-invasive-species/zebra-mussel | Zebra Mussel | Identification and Clean, Drain, Dry style public action guidance |
| https://extension.umn.edu/identify-invasive-species/common-carp | Common Carp | Identification, reporting guidance, habitat-effect summary |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=4 | Common Carp | Ecology, habitat damage, turbidity and plant-loss impacts |

### Chunk 2B follow-up, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://extension.umn.edu/plant-diseases/white-pine-blister-rust | White-pine blister rust | Disease cycle, pine and Ribes symptoms, pruning guidance, host-pairing guidance |
| https://apps.extension.umn.edu/garden/diagnose/weed/idlist.html | Yellow nutsedge | Basic control framing, tuber persistence, lawn and landscape context |
| https://www.canr.msu.edu/news/controlling_yellow_nutsedge_in_turfgrass | Yellow nutsedge | Homeowner management framing, repeat-treatment expectations, practical turf guidance |
| https://extension.umn.edu/identify-invasive-species/autumn-olive | Autumn Olive | Identification, origin, fruiting behavior, soil-change impact, reporting context |
| https://extension.umn.edu/planting-and-growing-guides/woody-vegetation-control | Autumn Olive, White Mulberry, Glossy Buckthorn | Cut stump and woody invasive control framing, resprout cautions, follow-up expectations |
| https://extension.umn.edu/identify-invasive-species/white-mulberry | White Mulberry | Identification, hybridization risk, escaped-cultivation context |
| https://extension.umn.edu/identify-invasive-species/glossy-buckthorn | Glossy Buckthorn | Identification, understory displacement, reporting context |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/cogongrass | Cogongrass | Origin, introduction pathway, dense-stand impact, reporting context |
| https://extension.msstate.edu/publications/cogongrass | Cogongrass | Identification details, rhizome spread, disturbance response, control cautions |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/saltcedar | Saltcedar | Introduction history, water-table and salinity impacts, broad invasive context |
| https://www.nps.gov/sagu/learn/nature/tamarisk.htm | Saltcedar | Riparian habitat effects, management cautions, wildlife-habitat caveat |
| https://www.aphis.usda.gov/operational-wildlife-activities/starlings-blackbirds | European Starling | Property and agricultural damage, native bird competition, exclusion and management guidance |
| https://www.invasivespeciesinfo.gov/terrestrial/vertebrates/european-starling | European Starling | Introduction history and broad invasive context |
| https://www.invasivespeciesinfo.gov/aquatic/invertebrates/asian-clam | Asiatic Clam | Origin, U.S. introduction timeline, colony-forming impact, public spread-prevention framing |
| https://nas.er.usgs.gov/queries/factsheet.aspx?speciesid=92 | Asiatic Clam | Ecology, infrastructure fouling, pipe-clogging impact, spread context |
| https://extension.umn.edu/identify-invasive-species/wild-parsnip | Wild Parsnip | Phototoxic burn risk, identification, reporting and handling guidance |
| https://extension.umn.edu/identify-invasive-species/poison-hemlock | Poison Hemlock | Toxicity, purple-blotched stem ID, reporting path, conservative handling guidance |
| https://extension.umn.edu/identify-invasive-species/spotted-knapweed | Spotted Knapweed | Identification, seed spread, handling caution, reporting context |

### Chunk 2C follow-up, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://extension.umn.edu/identify-invasive-species/norway-maple | Norway Maple | Identification, woodland impact, reporting context |
| https://extension.umn.edu/planting-and-growing-guides/woody-vegetation-control | Norway Maple | Cut stump and woody invasive control framing, follow-up expectations |
| https://extension.psu.edu/japanese-stiltgrass | Japanese Stiltgrass | Identification, spread pathways, understory impact, timing of control |
| https://extension.psu.edu/controlling-japanese-stiltgrass-in-your-garden | Japanese Stiltgrass | Home landscape management framing, practical control timing |
| https://extension.umn.edu/identify-invasive-species/white-and-yellow-sweetclover | Yellow Sweetclover | Identification, habitat impact, seedbank and reporting context |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/johnsongrass | Johnsongrass | Origin, introduction pathway, agricultural impact framing |
| https://extension.msstate.edu/publications/johnsongrass | Johnsongrass | Identification, livestock risk, practical management cautions |
| https://extension.umn.edu/nuisance-insects/multicolored-asian-lady-beetles | Multicolored Asian Lady Beetle | Identification, indoor nuisance framing, exclusion guidance |
| https://extension.umn.edu/yard-and-garden-news/soybean-harvest-brings-familiar-pest-asian-lady-beetles | Multicolored Asian Lady Beetle | Origin context, seasonal movement, crop-to-home transition framing |
| https://extension.umn.edu/identify-invasive-species/canada-thistle | Canada Thistle | Identification, rhizome spread, reporting context |
| https://blog-fruit-vegetable-ipm.extension.umn.edu/2023/04/a-war-of-attrition-canada-thistle.html | Canada Thistle | Repeat-management framing and root-focused control expectations |
| https://extension.umn.edu/identify-invasive-species/oxeye-daisy | Oxeye Daisy | Identification, habitat impact, reporting context |
| https://extension.umn.edu/identify-invasive-species/butter-and-eggs | Butter and Eggs | Identification, root spread, seed persistence, reporting context |
| https://extension.umn.edu/weed-identification/annual-broadleaf-weeds | Velvetleaf | Identification details, seed capsule traits, general weed framing |
| https://extension.umn.edu/yard-and-garden-news/zero-seed-rain | Velvetleaf | Seedbank persistence and practical removal timing |
| https://extension.okstate.edu/fact-sheets/ecology-and-management-of-sericea-lespedeza | Sericea Lespedeza | Origin, ecosystem impact, integrated management framing |
| https://extension.okstate.edu/programs/plant-id/plant-profiles/sericea-lespedeza/ | Sericea Lespedeza | Identification, leaflet traits, habitat context |
| https://apps.extension.umn.edu/garden/diagnose/plant/deciduous/butternut/trunkdieback.html | Butternut Canker Fungus | Canker symptoms, dieback pattern, tree-level diagnosis cues |
| https://extension.umn.edu/invasive-species/terrestrial-invasive-species-participatory-science-tips-projects | Butternut Canker Fungus | Reporting and conservation-monitoring context |
| https://extension.psu.edu/toxic-weed-in-the-landscape-jimsonweed | Jimsonweed | Toxicity, identification, seed pod cues, safe removal framing |
| https://extension.umn.edu/identify-invasive-species/leafy-spurge | Leafy Spurge | Identification, ecological impact, reporting context |
| https://apps.extension.umn.edu/garden/diagnose/weed/broadleaf/upright/leafyspurge.html | Leafy Spurge | Milky sap caution and weed-ID confirmation details |
| https://extension.umn.edu/identify-invasive-species/orange-hawkweed | Orange Hawkweed | Identification, spread by runners and seed, reporting context |
| https://extension.umn.edu/identify-invasive-species/common-and-cutleaf-teasel | Cutleaf Teasel | Identification, biennial life cycle, seedbank and reporting context |
| https://www.cdc.gov/dengue/stories/unwanted-mosquitoes.html | Yellow Fever Mosquito | Public health significance, adult ID, household prevention framing |
| https://www.cdc.gov/mosquitoes/about/life-cycle-of-aedes-mosquitoes.html | Yellow Fever Mosquito | Container breeding behavior and practical source-reduction guidance |
| https://extension.umn.edu/identify-invasive-species/common-tansy | Common Tansy | Identification, toxicity, reporting context |
| https://extension.umn.edu/identify-invasive-species/crown-vetch | Crown Vetch | Identification, rhizome spread, habitat impact, reporting context |
| https://extension.umn.edu/forage-variety-selection/forage-legumes | Crown Vetch | Origin, historical planting context, livestock caution |

## Contributor Rules

1. Prefer official agency, university extension, or public research program sources for curated profile writing.
2. Log every new source the same day you use it.
3. Record the actual date you fetched or consulted the source when that information is available.
4. If the exact date is unknown, say so plainly instead of inventing one.
5. When a source is only carried through from upstream data, label it as upstream-derived rather than curated.
